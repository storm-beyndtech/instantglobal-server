import mongoose from "mongoose";

const activityLogSchema = new mongoose.Schema(
	{
		userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
		eventType: {
			type: String,
			required: true,
			enum: [
				"LOGIN",
				"LOGOUT",
				"FAILED_LOGIN",
				"PASSWORD_CHANGE",
				"PASSWORD_RESET_REQUESTED",
				"PASSWORD_RESET_COMPLETED",
				"2FA_ENABLED",
				"2FA_DISABLED",
				"2FA_VERIFIED",
				"2FA_VERIFICATION_FAILED",
				"SESSION_TERMINATED",
				"SETTINGS_UPDATED",
				"API_KEY_CREATED",
				"API_KEY_REVOKED",
				"ROLE_CHANGED",
				"ROLE_CHANGE_BLOCKED",
				"PERMISSION_CHANGED",
				"SUSPICIOUS_ACTIVITY_REPORTED",
			],
			index: true,
		},
		status: {
			type: String,
			required: true,
			enum: ["SUCCESS", "FAILURE", "BLOCKED"],
			index: true,
		},
		riskLevel: {
			type: String,
			required: true,
			enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
			index: true,
		},
		ipAddress: { type: String, default: "", index: true },
		userAgent: { type: String, default: "" },
		location: {
			country: { type: String, default: "" },
			city: { type: String, default: "" },
			region: { type: String, default: "" },
			timezone: { type: String, default: "" },
			latitude: { type: Number, default: null },
			longitude: { type: Number, default: null },
		},
		device: {
			type: { type: String, default: "unknown" },
			os: { type: String, default: "unknown" },
			browser: { type: String, default: "unknown" },
		},
		metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
		timestamp: { type: Date, default: Date.now, index: true },
	},
	{
		versionKey: false,
	},
);

activityLogSchema.index({ userId: 1, timestamp: -1 });
activityLogSchema.index({ eventType: 1, status: 1, timestamp: -1 });
activityLogSchema.index({ riskLevel: 1, timestamp: -1 });

export const ActivityLog = mongoose.model("ActivityLog", activityLogSchema);
