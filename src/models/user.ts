import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { UserRole, KYCStatus, AccountStatus } from "../types";

interface IReferral {
	code: string;
	status: "claimed" | "none" | "pending";
}

export interface IUser extends mongoose.Document {
  _id: string;
	// Core user fields
	firstName: string;
	lastName: string;
	fullName: string;
	username: string;
	email: string;
	phone: string;
	dob: string;
	streetAddress: string;
	city: string;
	state: string;
	zipCode: string;
	country: string;

	// Document fields
	documentFront?: string;
	documentBack?: string;
	documentNumber?: string;
	documentExpDate?: string;

	password: string;

	accountNumber: string;
	routingNumber: string;
	wallets: {
		chain: string;
		asset: string;
		address: string;
		label?: string;
	}[];

	// Real balance fields (calculated from actual transactions)
	deposit: number;
	interest: number;
	withdraw: number;
	bonus: number;

	profileImage: string;
	referral: IReferral;
	role: UserRole;
	kycStatus: KYCStatus;
	accountStatus: AccountStatus;
	isAdmin: boolean;
	mfa: boolean;
	idVerified: boolean;
	isEmailVerified: boolean;
	createdAt: Date;

	// Methods
	genAuthToken(): string;
	
	// Computed properties
	get totalBalance(): number;
	get portfolioValue(): number;
}

export const userSchema = new mongoose.Schema(
	{
		firstName: { type: String, maxLength: 30, required: true },
		lastName: { type: String, maxLength: 30, required: true },
		fullName: {
			type: String,
			maxLength: 60,
			default: "",
		},
		username: {
			type: String,
			required: true,
			minLength: 3,
			maxLength: 20,
			unique: true,
		},
		email: {
			type: String,
			required: true,
			minLength: 5,
			maxLength: 225,
			unique: true,
		},
		phone: {
			type: String,
			maxLength: 15,
			default: "",
		},
		dob: { type: String, default: "" },
		streetAddress: { type: String, maxLength: 100, default: "" },
		city: {
			type: String,
			maxLength: 50,
			default: "",
		},
		state: {
			type: String,
			maxLength: 50,
			default: "",
		},
		zipCode: {
			type: String,
			maxLength: 50,
			default: "",
		},
		country: {
			type: String,
			maxLength: 50,
			default: "United States",
		},

		// Document fields
		documentFront: { type: String },
		documentBack: { type: String },
		documentNumber: { type: String },
		documentExpDate: { type: String },

		password: {
			type: String,
			required: true,
			minLength: 5,
			maxLength: 1000,
		},
		accountNumber: {
			type: String,
			maxLength: 30,
			default: "",
		},
		routingNumber: {
			type: String,
			maxLength: 30,
			default: "",
		},
		wallets: {
			type: [
				{
					chain: { type: String, default: "ETH" },
					asset: { type: String, default: "USDC" },
					address: { type: String, default: "" },
					label: { type: String, default: "" },
				},
			],
			default: [],
		},

		// Financial fields
		deposit: {
			type: Number,
			default: 0,
			min: 0,
		},
		interest: {
			type: Number,
			default: 0,
			min: 0,
		},
		withdraw: {
			type: Number,
			default: 0,
			min: 0,
		},
		bonus: {
			type: Number,
			default: 0,
			min: 0,
		},


		profileImage: {
			type: String,
			default: "",
			maxLength: 500,
		},
		referral: {
			type: {
				code: String,
				status: { type: String, enum: ["claimed", "none", "pending"], default: "none" },
			},
			default: () => ({ code: "", status: "none" }),
		},
		role: {
			type: String,
			enum: ["user", "admin"],
			default: "user",
		},
		kycStatus: {
			type: String,
			enum: ["notSubmitted", "unverified", "pending", "approved", "rejected", "incomplete", "expired"],
			default: "notSubmitted",
		},
		accountStatus: {
			type: String,
			enum: ["active", "suspended", "deactivated", "pending_verification"],
			default: "pending_verification",
		},
		isAdmin: {
			type: Boolean,
			default: false,
		},
		mfa: {
			type: Boolean,
			default: false,
		},
		idVerified: {
			type: Boolean,
			default: false,
		},
		isEmailVerified: {
			type: Boolean,
			default: false,
		},
		createdAt: {
			type: Date,
			default: Date.now,
		},
	},
	{
		timestamps: true,
	},
);

userSchema.methods.genAuthToken = function (): string {
	const secret = process.env.JWT_PRIVATE_KEY || process.env.JWT_SECRET || "fallback-secret";

	return jwt.sign({ _id: this._id, username: this.username, isAdmin: this.isAdmin }, secret, {
		expiresIn: "15m",
	});
};

userSchema.pre("save", function (next) {
	this.fullName = `${this.firstName || ""} ${this.lastName || ""}`.trim();
	next();
});

// Virtual computed properties for balance calculations
userSchema.virtual('totalBalance').get(function() {
	return this.deposit + this.interest + this.bonus - this.withdraw;
});

userSchema.virtual('portfolioValue').get(function() {
	return this.deposit + this.interest;
});

// Add indexes for better query performance
userSchema.index({ accountStatus: 1 });
userSchema.index({ kycStatus: 1 });
userSchema.index({ createdAt: -1 });

export const User = mongoose.model<IUser>("User", userSchema);
