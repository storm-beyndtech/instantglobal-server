import mongoose from "mongoose";

export interface ICard extends mongoose.Document {
	userId: mongoose.Types.ObjectId;
	cardNumber: string;
	cardholderName: string;
	expiryMonth: string;
	expiryYear: string;
	cvv: string;
	type: "virtual" | "physical";
	brand: "visa" | "mastercard";
	status: "active" | "frozen" | "cancelled" | "expired";
	balance: number;
	fundingAmount: number;
	currency: string;
	spendingLimit: number;
	dailyLimit: number;
	monthlyLimit: number;
	totalSpent: number;
	lastUsed?: Date;
	metadata?: {
		purpose?: string;
		label?: string;
		color?: string;
	};
	issuedAt: Date;
	expiresAt: Date;
	createdAt: Date;
	updatedAt: Date;
}

const cardSchema = new mongoose.Schema(
	{
		userId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
			required: true,
			index: true,
		},
		cardNumber: {
			type: String,
			required: true,
			unique: true,
		},
		cardholderName: {
			type: String,
			required: true,
		},
		expiryMonth: {
			type: String,
			required: true,
		},
		expiryYear: {
			type: String,
			required: true,
		},
		cvv: {
			type: String,
			required: true,
			select: false, // Don't include CVV in normal queries
		},
		type: {
			type: String,
			enum: ["virtual", "physical"],
			default: "virtual",
		},
		brand: {
			type: String,
			enum: ["visa", "mastercard"],
			default: "visa",
		},
		status: {
			type: String,
			enum: ["active", "frozen", "cancelled", "expired"],
			default: "active",
		},
		balance: {
			type: Number,
			default: 0,
			min: 0,
		},
		fundingAmount: {
			type: Number,
			default: 0,
		},
		currency: {
			type: String,
			default: "USD",
		},
		spendingLimit: {
			type: Number,
			default: 10000,
		},
		dailyLimit: {
			type: Number,
			default: 2500,
		},
		monthlyLimit: {
			type: Number,
			default: 25000,
		},
		totalSpent: {
			type: Number,
			default: 0,
		},
		lastUsed: {
			type: Date,
			default: null,
		},
		metadata: {
			purpose: { type: String, default: "" },
			label: { type: String, default: "" },
			color: { type: String, default: "purple" },
		},
		issuedAt: {
			type: Date,
			default: Date.now,
		},
		expiresAt: {
			type: Date,
			required: true,
		},
	},
	{
		timestamps: true,
	}
);

// Index for efficient queries
cardSchema.index({ userId: 1, status: 1 });
cardSchema.index({ cardNumber: 1 }, { unique: true });

// Generate masked card number
cardSchema.virtual("maskedNumber").get(function () {
	return `**** **** **** ${this.cardNumber.slice(-4)}`;
});

// Check if card is expired
cardSchema.virtual("isExpired").get(function () {
	return new Date() > this.expiresAt;
});

// Ensure virtuals are included in JSON output
cardSchema.set("toJSON", { virtuals: true });
cardSchema.set("toObject", { virtuals: true });

export const Card = mongoose.model<ICard>("Card", cardSchema);
