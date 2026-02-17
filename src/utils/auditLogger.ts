import { Request } from "express";
import { AuditLog } from "../models/auditLog";

type JsonLike = Record<string, any> | null;

function isPrivateIp(ip: string): boolean {
	return (
		ip.startsWith("10.") ||
		ip.startsWith("192.168.") ||
		ip.startsWith("127.") ||
		ip.startsWith("172.16.") ||
		ip.startsWith("172.17.") ||
		ip.startsWith("172.18.") ||
		ip.startsWith("172.19.") ||
		ip.startsWith("172.2") ||
		ip.startsWith("::1") ||
		ip.startsWith("fc") ||
		ip.startsWith("fd")
	);
}

function normalizeIp(rawIp: string | undefined): string {
	if (!rawIp) return "";
	let ip = rawIp.trim();
	if (ip.includes(",")) ip = ip.split(",")[0].trim();
	if (ip.startsWith("::ffff:")) ip = ip.replace("::ffff:", "");
	return ip;
}

function extractRequestMeta(req: Request) {
	const forwardedFor = String(req.headers["x-forwarded-for"] || "");
	const clientIp =
		normalizeIp(String(req.headers["fly-client-ip"] || "")) ||
		normalizeIp(String(req.headers["cf-connecting-ip"] || "")) ||
		normalizeIp(forwardedFor) ||
		normalizeIp(req.ip);

	return {
		method: req.method,
		path: req.originalUrl || req.url,
		ip: clientIp,
		forwardedFor,
		userAgent: String(req.headers["user-agent"] || ""),
		origin: String(req.headers.origin || ""),
		referer: String(req.headers.referer || ""),
		flyRegion: String(req.headers["fly-region"] || ""),
		country: String(req.headers["cf-ipcountry"] || req.headers["x-vercel-ip-country"] || ""),
		city: String(req.headers["x-vercel-ip-city"] || ""),
		region: String(req.headers["x-vercel-ip-country-region"] || ""),
		timezone: String(req.headers["x-timezone"] || ""),
		latitude: null as number | null,
		longitude: null as number | null,
		meta: {
			acceptLanguage: String(req.headers["accept-language"] || ""),
			secChUa: String(req.headers["sec-ch-ua"] || ""),
		},
	};
}

async function resolveGeo(ip: string) {
	if (!ip || isPrivateIp(ip)) return null;
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 1500);

	try {
		const resp = await fetch(`https://ipapi.co/${ip}/json/`, {
			signal: controller.signal,
		});
		if (!resp.ok) return null;
		const data: any = await resp.json();
		if (data?.error) return null;
		return {
			country: data.country_code || data.country_name || "",
			city: data.city || "",
			region: data.region || "",
			timezone: data.timezone || "",
			latitude: Number.isFinite(Number(data.latitude)) ? Number(data.latitude) : null,
			longitude: Number.isFinite(Number(data.longitude)) ? Number(data.longitude) : null,
		};
	} catch {
		return null;
	} finally {
		clearTimeout(timeout);
	}
}

function buildDiff(before: JsonLike, after: JsonLike): JsonLike {
	if (!before || !after) return null;
	const diff: Record<string, { before: any; after: any }> = {};
	const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
	for (const key of keys) {
		const left = (before as Record<string, any>)[key];
		const right = (after as Record<string, any>)[key];
		if (JSON.stringify(left) !== JSON.stringify(right)) {
			diff[key] = { before: left, after: right };
		}
	}
	return Object.keys(diff).length ? diff : null;
}

interface AuditInput {
	req: Request;
	action: string;
	actor?: { userId?: string; email?: string; isAdmin?: boolean };
	target: { entityType: string; entityId: string; userId?: string; email?: string };
	before?: JsonLike;
	after?: JsonLike;
	success: boolean;
	message?: string;
	error?: string;
}

export async function logAudit(input: AuditInput): Promise<void> {
	try {
		const requestMeta = extractRequestMeta(input.req);
		const geo = await resolveGeo(requestMeta.ip);
		if (geo) {
			requestMeta.country = geo.country || requestMeta.country;
			requestMeta.city = geo.city || requestMeta.city;
			requestMeta.region = geo.region || requestMeta.region;
			requestMeta.timezone = geo.timezone || requestMeta.timezone;
			requestMeta.latitude = geo.latitude;
			requestMeta.longitude = geo.longitude;
		}

		await AuditLog.create({
			action: input.action,
			actor: {
				userId: input.actor?.userId || null,
				email: input.actor?.email || "",
				isAdmin: Boolean(input.actor?.isAdmin),
			},
			target: {
				entityType: input.target.entityType,
				entityId: input.target.entityId,
				userId: input.target.userId || null,
				email: input.target.email || "",
			},
			request: requestMeta,
			changes: {
				before: input.before ?? null,
				after: input.after ?? null,
				diff: buildDiff(input.before ?? null, input.after ?? null),
			},
			outcome: {
				success: input.success,
				message: input.message || "",
				error: input.error || "",
			},
		});
	} catch (err) {
		console.error("Audit log write failed:", err);
	}
}

