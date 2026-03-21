import { Request } from "express";
import crypto from "crypto";
import { ActivityLog } from "../models/activityLog";
import { securityAlertEmail } from "./mailer";

type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
type ActivityStatus = "SUCCESS" | "FAILURE" | "BLOCKED";

interface GeoData {
	country: string;
	city: string;
	region: string;
	timezone: string;
	latitude: number | null;
	longitude: number | null;
}

interface DeviceInfo {
	type: string;
	os: string;
	browser: string;
}

interface LogActivityInput {
	req: Request;
	userId?: string | null;
	eventType:
		| "LOGIN"
		| "LOGOUT"
		| "FAILED_LOGIN"
		| "PASSWORD_CHANGE"
		| "PASSWORD_RESET_REQUESTED"
		| "PASSWORD_RESET_COMPLETED"
		| "2FA_ENABLED"
		| "2FA_DISABLED"
		| "2FA_VERIFIED"
		| "2FA_VERIFICATION_FAILED"
		| "SESSION_TERMINATED"
		| "SETTINGS_UPDATED"
		| "API_KEY_CREATED"
		| "API_KEY_REVOKED"
		| "ROLE_CHANGED"
		| "ROLE_CHANGE_BLOCKED"
		| "PERMISSION_CHANGED"
		| "SUSPICIOUS_ACTIVITY_REPORTED";
	status: ActivityStatus;
	metadata?: Record<string, any>;
}

let lastRetentionSweepAt = 0;

function normalizeIp(rawIp: string | undefined): string {
	if (!rawIp) return "";
	let ip = rawIp.trim();
	if (ip.includes(",")) ip = ip.split(",")[0].trim();
	if (ip.startsWith("::ffff:")) ip = ip.replace("::ffff:", "");
	return ip;
}

function isPrivateIp(ip: string): boolean {
	return (
		!ip ||
		ip.startsWith("10.") ||
		ip.startsWith("192.168.") ||
		ip.startsWith("127.") ||
		ip.startsWith("172.") ||
		ip.startsWith("::1") ||
		ip.startsWith("fc") ||
		ip.startsWith("fd")
	);
}

function extractClientIp(req: Request): string {
	const forwardedFor = String(req.headers["x-forwarded-for"] || "");
	return (
		normalizeIp(String(req.headers["fly-client-ip"] || "")) ||
		normalizeIp(String(req.headers["cf-connecting-ip"] || "")) ||
		normalizeIp(forwardedFor) ||
		normalizeIp(req.ip)
	);
}

function parseDevice(userAgent: string): DeviceInfo {
	const ua = (userAgent || "").toLowerCase();
	const isMobile = /mobile|android|iphone|ipod/.test(ua);
	const isTablet = /ipad|tablet/.test(ua);
	const type = isTablet ? "tablet" : isMobile ? "mobile" : "desktop";

	let os = "unknown";
	if (ua.includes("windows")) os = "Windows";
	else if (ua.includes("mac os") || ua.includes("macintosh")) os = "macOS";
	else if (ua.includes("android")) os = "Android";
	else if (ua.includes("iphone") || ua.includes("ipad")) os = "iOS";
	else if (ua.includes("linux")) os = "Linux";

	let browser = "unknown";
	if (ua.includes("edg/")) browser = "Edge";
	else if (ua.includes("opr/") || ua.includes("opera")) browser = "Opera";
	else if (ua.includes("chrome/")) browser = "Chrome";
	else if (ua.includes("safari/") && !ua.includes("chrome/")) browser = "Safari";
	else if (ua.includes("firefox/")) browser = "Firefox";

	return { type, os, browser };
}

async function resolveGeo(ip: string): Promise<GeoData | null> {
	if (isPrivateIp(ip)) return null;
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 1500);
	try {
		const resp = await fetch(`https://ipapi.co/${ip}/json/`, { signal: controller.signal });
		if (!resp.ok) return null;
		const data = (await resp.json()) as Record<string, any>;
		if (data.error) return null;
		return {
			country: String(data.country_code || data.country_name || ""),
			city: String(data.city || ""),
			region: String(data.region || ""),
			timezone: String(data.timezone || ""),
			latitude: Number.isFinite(Number(data.latitude)) ? Number(data.latitude) : null,
			longitude: Number.isFinite(Number(data.longitude)) ? Number(data.longitude) : null,
		};
	} catch {
		return null;
	} finally {
		clearTimeout(timeout);
	}
}

function getDeviceFingerprint(userAgent: string, ip: string): string {
	return crypto.createHash("sha256").update(`${userAgent}|${ip}`).digest("hex");
}

async function detectSuspiciousPatterns(input: {
	userId?: string | null;
	eventType: LogActivityInput["eventType"];
	status: ActivityStatus;
	deviceFingerprint: string;
	locationKey: string;
}): Promise<{ riskBoost: RiskLevel; flags: string[] }> {
	const flags: string[] = [];
	let riskBoost: RiskLevel = "LOW";

	if (input.eventType === "FAILED_LOGIN" && input.userId) {
		const since = new Date(Date.now() - 15 * 60 * 1000);
		const failedCount = await ActivityLog.countDocuments({
			userId: input.userId,
			eventType: "FAILED_LOGIN",
			status: "FAILURE",
			timestamp: { $gte: since },
		});
		if (failedCount >= 5) {
			flags.push("multiple_failed_logins");
			riskBoost = "HIGH";
		}
	}

	if (input.eventType === "LOGIN" && input.status === "SUCCESS" && input.userId) {
		const previousLogin = await ActivityLog.findOne({
			userId: input.userId,
			eventType: "LOGIN",
			status: "SUCCESS",
		})
			.sort({ timestamp: -1 })
			.lean();

		if (previousLogin) {
			const previousFingerprint = String(previousLogin?.metadata?.deviceFingerprint || "");
			const previousLocation = String(previousLogin?.metadata?.locationKey || "");
			if (previousFingerprint && previousFingerprint !== input.deviceFingerprint) {
				flags.push("new_device_login");
				riskBoost = "MEDIUM";
			}
			if (previousLocation && previousLocation !== input.locationKey) {
				flags.push("new_location_login");
				riskBoost = riskBoost === "HIGH" ? "HIGH" : "MEDIUM";
			}
			if (flags.includes("new_device_login") && flags.includes("new_location_login")) {
				riskBoost = "HIGH";
			}
		}
	}

	return { riskBoost, flags };
}

function deriveBaseRisk(eventType: LogActivityInput["eventType"], status: ActivityStatus): RiskLevel {
	if (status === "BLOCKED") return "MEDIUM";
	if (status === "FAILURE") return "MEDIUM";
	if (eventType === "ROLE_CHANGED" || eventType === "PERMISSION_CHANGED") return "HIGH";
	if (eventType === "SESSION_TERMINATED" || eventType === "SUSPICIOUS_ACTIVITY_REPORTED") return "HIGH";
	return "LOW";
}

function maxRisk(a: RiskLevel, b: RiskLevel): RiskLevel {
	const rank: Record<RiskLevel, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
	return rank[a] >= rank[b] ? a : b;
}

async function maybeSendSecurityAlert(params: {
	riskLevel: RiskLevel;
	eventType: LogActivityInput["eventType"];
	status: ActivityStatus;
	userId?: string | null;
	ipAddress: string;
	location: GeoData | null;
	device: DeviceInfo;
}): Promise<void> {
	if (!(params.riskLevel === "HIGH" || params.riskLevel === "CRITICAL")) return;
	const adminEmail = process.env.ADMIN_EMAIL || process.env.SUPPORT_EMAIL;
	if (!adminEmail) return;

	const subject = `[Security Alert] ${params.eventType} (${params.riskLevel})`;
	const body = `
		<p><strong>Risk Level:</strong> ${params.riskLevel}</p>
		<p><strong>Event:</strong> ${params.eventType}</p>
		<p><strong>Status:</strong> ${params.status}</p>
		<p><strong>User ID:</strong> ${params.userId || "unknown"}</p>
		<p><strong>IP:</strong> ${params.ipAddress || "unknown"}</p>
		<p><strong>Location:</strong> ${params.location?.city || ""} ${params.location?.region || ""} ${
			params.location?.country || ""
		}</p>
		<p><strong>Device:</strong> ${params.device.type} / ${params.device.os} / ${params.device.browser}</p>
	`;

	try {
		await securityAlertEmail(adminEmail, subject, body);
	} catch (error) {
		console.error("Failed to send security alert email:", error);
	}
}

async function runRetentionSweep(): Promise<void> {
	const now = Date.now();
	if (now - lastRetentionSweepAt < 60 * 60 * 1000) return;
	lastRetentionSweepAt = now;
	const days = Math.max(1, parseInt(process.env.ACTIVITY_LOG_RETENTION_DAYS || "90", 10));
	const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
	try {
		await ActivityLog.deleteMany({ timestamp: { $lt: cutoff } });
	} catch (error) {
		console.error("Activity retention sweep failed:", error);
	}
}

export async function logActivity(input: LogActivityInput): Promise<void> {
	try {
		const ipAddress = extractClientIp(input.req);
		const userAgent = String(input.req.headers["user-agent"] || "");
		const device = parseDevice(userAgent);
		const geo = await resolveGeo(ipAddress);
		const location: GeoData = geo || {
			country: String(input.req.headers["cf-ipcountry"] || input.req.headers["x-vercel-ip-country"] || ""),
			city: String(input.req.headers["x-vercel-ip-city"] || ""),
			region: String(input.req.headers["x-vercel-ip-country-region"] || ""),
			timezone: String(input.req.headers["x-timezone"] || ""),
			latitude: null,
			longitude: null,
		};

		const locationKey = `${location.country}|${location.region}|${location.city}`;
		const deviceFingerprint = getDeviceFingerprint(userAgent, ipAddress);
		const suspicious = await detectSuspiciousPatterns({
			userId: input.userId,
			eventType: input.eventType,
			status: input.status,
			deviceFingerprint,
			locationKey,
		});

		const riskLevel = maxRisk(deriveBaseRisk(input.eventType, input.status), suspicious.riskBoost);

		await ActivityLog.create({
			userId: input.userId || null,
			eventType: input.eventType,
			status: input.status,
			riskLevel,
			ipAddress,
			userAgent,
			location,
			device,
			timestamp: new Date(),
			metadata: {
				...(input.metadata || {}),
				deviceFingerprint,
				locationKey,
				path: input.req.originalUrl || input.req.url,
				method: input.req.method,
				suspiciousFlags: suspicious.flags,
				forwardedFor: String(input.req.headers["x-forwarded-for"] || ""),
				referer: String(input.req.headers.referer || ""),
			},
		});

		void maybeSendSecurityAlert({
			riskLevel,
			eventType: input.eventType,
			status: input.status,
			userId: input.userId,
			ipAddress,
			location,
			device,
		});
		void runRetentionSweep();
	} catch (error) {
		console.error("Activity log write failed:", error);
	}
}
