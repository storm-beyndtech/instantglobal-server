import mongoose from "mongoose";
import { z } from "zod";

export interface IKyc extends mongoose.Document {
  name: string;
  email: string;
  documentFront?: string;
  documentBack?: string;
  documentNumber: string;
  documentExpDate: string;
  status: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Kyc schema
const kycSchema = new mongoose.Schema({
  name: {
    type: String,
    default: "",
  },
  email: {
    type: String,
    required: true,
    minLength: 5,
    maxLength: 225,
  },
  documentFront: { type: String },
  documentBack: { type: String },
  documentNumber: { type: String, required: true },
  documentExpDate: { type: String, required: true },
  status: {
    type: Boolean,
    default: false,
  },
}, {
  timestamps: true
});

// Add indexes for better query performance
kycSchema.index({ email: 1 });
kycSchema.index({ status: 1 });
kycSchema.index({ createdAt: -1 });

// kyc model
export const Kyc = mongoose.model<IKyc>("Kyc", kycSchema);

// Zod validation schema for KYC (replacing Joi)
export const validateKyc = z.object({
  name: z.string().optional(),
  email: z.email().min(5).max(225),
  documentNumber: z.string().min(3).max(50),
  documentExpDate: z.string().min(1),
});

export type KycValidation = z.infer<typeof validateKyc>;