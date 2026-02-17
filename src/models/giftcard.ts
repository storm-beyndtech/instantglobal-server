import mongoose, { Schema, Document, Model } from "mongoose";

export interface IGiftCard extends Document {
  _id: mongoose.Types.ObjectId;
  code: string;
  amount: number;
  currency: string;
  status: "active" | "redeemed" | "expired" | "cancelled";
  issuedBy: mongoose.Types.ObjectId;
  recipient?: string;
  redeemedBy?: mongoose.Types.ObjectId;
  redeemedAt?: Date;
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const GiftCardSchema = new Schema<IGiftCard>(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 1,
    },
    currency: {
      type: String,
      default: "USD",
    },
    status: {
      type: String,
      enum: ["active", "redeemed", "expired", "cancelled"],
      default: "active",
    },
    issuedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    recipient: {
      type: String,
    },
    redeemedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    redeemedAt: {
      type: Date,
    },
    expiresAt: {
      type: Date,
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
  },
  { timestamps: true }
);

// Generate unique gift card code
GiftCardSchema.statics.generateCode = function (): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

interface GiftCardModel extends Model<IGiftCard> {
  generateCode(): string;
}

const GiftCard = mongoose.model<IGiftCard, GiftCardModel>("GiftCard", GiftCardSchema);

export default GiftCard;
