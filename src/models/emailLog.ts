import mongoose from "mongoose";

const emailLogSchema = new mongoose.Schema(
	{
		to: { type: String, required: true, index: true },
		subject: { type: String, required: true },
		template: { type: String, default: "custom", index: true },
		type: { type: String, enum: ["individual", "bulk"], default: "individual", index: true },
		status: { type: String, enum: ["sent", "failed", "pending"], default: "pending", index: true },
		error: { type: String, default: "" },
		sentAt: { type: Date, default: Date.now, index: true },
		createdBy: {
			userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
			email: { type: String, default: "" },
		},
	},
	{
		timestamps: true,
	},
);

emailLogSchema.index({ createdAt: -1 });

export const EmailLog = mongoose.model("EmailLog", emailLogSchema);

