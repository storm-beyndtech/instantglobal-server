import express, { Response } from "express";
import { requireAuth, requireAdmin, AuthRequest } from "../middleware/auth";
import { multiMails } from "../utils/mailer";
import { EmailLog } from "../models/emailLog";

const router = express.Router();

function isValidEmail(email: string): boolean {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

router.post("/send-email", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
	try {
		const { to, subject, message, type = "custom" } = req.body || {};
		if (!to || !subject || !message) {
			return res.status(400).json({ message: "to, subject and message are required" });
		}
		if (!isValidEmail(String(to))) {
			return res.status(400).json({ message: "Invalid recipient email" });
		}

		await EmailLog.create({
			to: String(to),
			subject: String(subject),
			template: String(type || "custom"),
			type: "individual",
			status: "pending",
			createdBy: {
				userId: req.user?.userId || null,
				email: req.user?.email || "",
			},
		});

		const result = await multiMails([String(to)], String(subject), String(message));
		if ((result as any)?.error) {
			await EmailLog.create({
				to: String(to),
				subject: String(subject),
				template: String(type || "custom"),
				type: "individual",
				status: "failed",
				error: String((result as any).error),
				createdBy: {
					userId: req.user?.userId || null,
					email: req.user?.email || "",
				},
			});
			return res.status(500).json({ message: "Failed to send email", error: (result as any).error });
		}

		await EmailLog.create({
			to: String(to),
			subject: String(subject),
			template: String(type || "custom"),
			type: "individual",
			status: "sent",
			createdBy: {
				userId: req.user?.userId || null,
				email: req.user?.email || "",
			},
		});

		return res.json({ message: "Email sent successfully" });
	} catch (error: any) {
		console.error("Admin send-email error:", error);
		return res.status(500).json({ message: "Failed to send email", error: error.message });
	}
});

router.post("/send-bulk-email", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
	try {
		const { recipients, subject, message, type = "bulk" } = req.body || {};
		if (!Array.isArray(recipients) || recipients.length === 0) {
			return res.status(400).json({ message: "recipients must be a non-empty array" });
		}
		if (!subject || !message) {
			return res.status(400).json({ message: "subject and message are required" });
		}

		const cleanedRecipients = recipients
			.map((x: any) => String(x).trim().toLowerCase())
			.filter((x: string) => isValidEmail(x));
		const uniqueRecipients = Array.from(new Set(cleanedRecipients));

		if (!uniqueRecipients.length) {
			return res.status(400).json({ message: "No valid recipient emails found" });
		}

		await EmailLog.create({
			to: `${uniqueRecipients.length} recipients`,
			subject: String(subject),
			template: String(type || "bulk"),
			type: "bulk",
			status: "pending",
			createdBy: {
				userId: req.user?.userId || null,
				email: req.user?.email || "",
			},
		});

		const result = await multiMails(uniqueRecipients, String(subject), String(message));
		if ((result as any)?.error) {
			await EmailLog.create({
				to: `${uniqueRecipients.length} recipients`,
				subject: String(subject),
				template: String(type || "bulk"),
				type: "bulk",
				status: "failed",
				error: String((result as any).error),
				createdBy: {
					userId: req.user?.userId || null,
					email: req.user?.email || "",
				},
			});
			return res.status(500).json({ message: "Failed to send bulk email", error: (result as any).error });
		}

		await EmailLog.create({
			to: `${uniqueRecipients.length} recipients`,
			subject: String(subject),
			template: String(type || "bulk"),
			type: "bulk",
			status: "sent",
			createdBy: {
				userId: req.user?.userId || null,
				email: req.user?.email || "",
			},
		});

		return res.json({ message: "Bulk email sent successfully", sent: uniqueRecipients.length });
	} catch (error: any) {
		console.error("Admin send-bulk-email error:", error);
		return res.status(500).json({ message: "Failed to send bulk email", error: error.message });
	}
});

router.get("/email-logs", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
	try {
		const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || "50"), 10)));
		const logs = await EmailLog.find().sort({ sentAt: -1 }).limit(limit).lean();
		return res.json(logs);
	} catch (error: any) {
		console.error("Admin email-logs error:", error);
		return res.status(500).json({ message: "Failed to fetch email logs", error: error.message });
	}
});

export default router;

