import mongoose from "mongoose";

export interface IOtp extends mongoose.Document {
	email: string;
	code: string;
	createdAt: Date;
}

const otpSchema = new mongoose.Schema({
	email: {
		type: String,
		required: true,
		minLength: 5,
		maxLength: 225,
	},
	code: {
		type: String,
		default: function (): string {
			return Math.floor(100000 + Math.random() * 900000).toString();
		},
	},
	createdAt: {
		type: Date,
		default: Date.now,
		expires: 300, // 5 minutes
	},
});

// Add indexes for better query performance
otpSchema.index({ email: 1 });

export const Otp = mongoose.model<IOtp>("Otp", otpSchema);
