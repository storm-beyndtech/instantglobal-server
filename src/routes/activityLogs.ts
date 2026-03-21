import express, { Response } from "express";
import { ActivityLog } from "../models/activityLog";
import { User } from "../models/user";
import { AuthRequest, requireAdmin, requireAuth } from "../middleware/auth";
import { logActivity } from "../utils/activityLogger";

const router = express.Router();

function toCsv(logs: any[]): string {
	const header = [
		"id",
		"userId",
		"eventType",
		"status",
		"riskLevel",
		"ipAddress",
		"country",
		"region",
		"city",
		"deviceType",
		"os",
		"browser",
		"timestamp",
	];
	const rows = logs.map((log) => {
		const values = [
			String(log._id || ""),
			String(log.userId || ""),
			String(log.eventType || ""),
			String(log.status || ""),
			String(log.riskLevel || ""),
			String(log.ipAddress || ""),
			String(log.location?.country || ""),
			String(log.location?.region || ""),
			String(log.location?.city || ""),
			String(log.device?.type || ""),
			String(log.device?.os || ""),
			String(log.device?.browser || ""),
			new Date(log.timestamp).toISOString(),
		];
		return values.map((value) => `"${value.replace(/"/g, '""')}"`).join(",");
	});
	return [header.join(","), ...rows].join("\n");
}

// GET /api/activity-logs
router.get("/", requireAuth, async (req: AuthRequest, res: Response) => {
	try {
		const page = Math.max(1, parseInt(String(req.query.page || "1"), 10));
		const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || "20"), 10)));
		const sortBy = String(req.query.sortBy || "timestamp");
		const sortOrder = String(req.query.sortOrder || "desc") === "asc" ? 1 : -1;
		const from = String(req.query.from || "");
		const to = String(req.query.to || "");
		const status = String(req.query.status || "");
		const riskLevel = String(req.query.riskLevel || "");
		const exportType = String(req.query.export || "").toLowerCase();
		const userIdQuery = String(req.query.userId || "");
		const eventTypeQuery = String(req.query.eventType || "");
		const eventTypes = eventTypeQuery
			.split(",")
			.map((x) => x.trim())
			.filter(Boolean);

		const filter: Record<string, any> = {};
		if (!req.user?.isAdmin) {
			filter.userId = req.user?.userId;
		} else if (userIdQuery) {
			filter.userId = userIdQuery;
		}
		if (eventTypes.length) filter.eventType = { $in: eventTypes };
		if (status) filter.status = status;
		if (riskLevel) filter.riskLevel = riskLevel;
		if (from || to) {
			filter.timestamp = {};
			if (from) filter.timestamp.$gte = new Date(from);
			if (to) filter.timestamp.$lte = new Date(to);
		}

		const sort: Record<string, 1 | -1> = {
			[sortBy]: sortOrder as 1 | -1,
		};

		const baseQuery = ActivityLog.find(filter).sort(sort);
		if (exportType === "csv" || exportType === "json") {
			const logs = await baseQuery.limit(5000).lean();
			if (exportType === "json") {
				return res.json({ logs, exportedAt: new Date().toISOString(), count: logs.length });
			}
			const csv = toCsv(logs);
			res.setHeader("Content-Type", "text/csv");
			res.setHeader("Content-Disposition", `attachment; filename="activity-logs-${Date.now()}.csv"`);
			return res.status(200).send(csv);
		}

		const skip = (page - 1) * limit;
		const [logs, total] = await Promise.all([baseQuery.skip(skip).limit(limit).lean(), ActivityLog.countDocuments(filter)]);

		return res.json({
			logs,
			total,
			page,
			limit,
			totalPages: Math.ceil(total / limit),
		});
	} catch (error) {
		console.error("Error fetching activity logs:", error);
		return res.status(500).json({ message: "Failed to fetch activity logs" });
	}
});

// POST /api/activity-logs/force-logout-all
router.post("/force-logout-all", requireAuth, async (req: AuthRequest, res: Response) => {
	try {
		const targetUserId = req.user?.isAdmin && req.body?.userId ? String(req.body.userId) : String(req.user?.userId || "");
		if (!targetUserId) {
			return res.status(400).json({ message: "User ID required" });
		}

		await User.findByIdAndUpdate(targetUserId, { $inc: { sessionVersion: 1 } });
		void logActivity({
			req,
			userId: targetUserId,
			eventType: "SESSION_TERMINATED",
			status: "SUCCESS",
			metadata: { initiatedBy: req.user?.userId, initiatedByAdmin: Boolean(req.user?.isAdmin) },
		});

		return res.json({ message: "All active sessions have been invalidated" });
	} catch (error) {
		console.error("Error forcing logout all sessions:", error);
		return res.status(500).json({ message: "Failed to terminate sessions" });
	}
});

// Admin monitor endpoint for active sessions style view
router.get("/admin/active-sessions", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
	try {
		const sessions = await ActivityLog.find({
			eventType: "LOGIN",
			status: "SUCCESS",
			timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
		})
			.sort({ timestamp: -1 })
			.limit(100)
			.select("userId ipAddress location device timestamp riskLevel")
			.lean();

		return res.json({ sessions });
	} catch (error) {
		console.error("Error loading active sessions view:", error);
		return res.status(500).json({ message: "Failed to fetch active sessions" });
	}
});

// POST /api/activity-logs/:id/report-suspicious
router.post("/:id/report-suspicious", requireAuth, async (req: AuthRequest, res: Response) => {
	try {
		const { reason = "", forceLogoutAll = true } = req.body || {};
		const log = await ActivityLog.findById(req.params.id);
		if (!log) {
			return res.status(404).json({ message: "Activity log not found" });
		}

		if (!req.user?.isAdmin && String(log.userId || "") !== String(req.user?.userId || "")) {
			return res.status(403).json({ message: "Access denied" });
		}

		log.metadata = {
			...(log.metadata || {}),
			reportedByUser: true,
			reportReason: String(reason || ""),
			reportedAt: new Date().toISOString(),
		};
		await log.save();

		if (forceLogoutAll && log.userId) {
			await User.findByIdAndUpdate(log.userId, { $inc: { sessionVersion: 1 } });
			void logActivity({
				req,
				userId: String(log.userId),
				eventType: "SESSION_TERMINATED",
				status: "SUCCESS",
				metadata: { reason: "Suspicious activity reported by user/admin", sourceLogId: String(log._id) },
			});
		}

		void logActivity({
			req,
			userId: String(log.userId || req.user?.userId || ""),
			eventType: "SUSPICIOUS_ACTIVITY_REPORTED",
			status: "SUCCESS",
			metadata: {
				sourceLogId: String(log._id),
				reason: String(reason || ""),
				forceLogoutAll: Boolean(forceLogoutAll),
			},
		});

		return res.json({ message: "Security report submitted", forceLogoutApplied: Boolean(forceLogoutAll) });
	} catch (error) {
		console.error("Error reporting suspicious activity:", error);
		return res.status(500).json({ message: "Failed to report suspicious activity" });
	}
});

// GET /api/activity-logs/:id
router.get("/:id", requireAuth, async (req: AuthRequest, res: Response) => {
	try {
		const log = await ActivityLog.findById(req.params.id).lean();
		if (!log) {
			return res.status(404).json({ message: "Activity log not found" });
		}
		if (!req.user?.isAdmin && String(log.userId || "") !== String(req.user?.userId || "")) {
			return res.status(403).json({ message: "Access denied" });
		}
		return res.json(log);
	} catch (error) {
		console.error("Error fetching activity log:", error);
		return res.status(500).json({ message: "Failed to fetch activity log" });
	}
});

export default router;
