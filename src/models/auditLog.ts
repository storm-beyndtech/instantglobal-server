import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema(
	{
		action: { type: String, required: true, index: true },
		actor: {
			userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
			email: { type: String, default: "" },
			isAdmin: { type: Boolean, default: false },
		},
		target: {
			entityType: { type: String, required: true, index: true },
			entityId: { type: String, required: true, index: true },
			userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
			email: { type: String, default: "" },
		},
		request: {
			method: { type: String, default: "" },
			path: { type: String, default: "" },
			ip: { type: String, default: "" },
			forwardedFor: { type: String, default: "" },
			userAgent: { type: String, default: "" },
			origin: { type: String, default: "" },
			referer: { type: String, default: "" },
			flyRegion: { type: String, default: "" },
			country: { type: String, default: "" },
			city: { type: String, default: "" },
			region: { type: String, default: "" },
			timezone: { type: String, default: "" },
			latitude: { type: Number, default: null },
			longitude: { type: Number, default: null },
			meta: { type: mongoose.Schema.Types.Mixed, default: {} },
		},
		changes: {
			before: { type: mongoose.Schema.Types.Mixed, default: null },
			after: { type: mongoose.Schema.Types.Mixed, default: null },
			diff: { type: mongoose.Schema.Types.Mixed, default: null },
		},
		outcome: {
			success: { type: Boolean, required: true, index: true },
			message: { type: String, default: "" },
			error: { type: String, default: "" },
		},
	},
	{
		timestamps: { createdAt: true, updatedAt: false },
	},
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ "actor.userId": 1, createdAt: -1 });
auditLogSchema.index({ "target.entityType": 1, "target.entityId": 1, createdAt: -1 });

export const AuditLog = mongoose.model("AuditLog", auditLogSchema);

