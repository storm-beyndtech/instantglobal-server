import { Request, Response, NextFunction } from "express";
import { z, ZodSchema } from "zod";

// Validation middleware factory
export const validate = (schema: ZodSchema) => {
	return (req: Request, res: Response, next: NextFunction) => {
		try {
			schema.parse(req.body);
			next();
		} catch (error) {
			if (error instanceof z.ZodError) {
				const errors = error.issues.map((err: z.ZodIssue) => ({
					field: err.path.join("."),
					message: err.message,
				}));
				return res.status(400).json({
					message: "Validation failed",
					errors,
				});
			}
			return res.status(400).json({ message: "Invalid request data" });
		}
	};
};

// Auth validation schemas
export const registerSchema = z.object({
	firstName: z.string().min(1, "First name is required").max(50),
	lastName: z.string().min(1, "Last name is required").max(50),
	username: z.string().min(3, "Username must be at least 3 characters").max(20).regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores"),
	email: z.string().email("Invalid email address"),
	password: z.string().min(8, "Password must be at least 8 characters").max(100),
	referralCode: z.string().optional(),
	phone: z.string().optional(),
	dob: z.string().optional(),
	streetAddress: z.string().optional(),
	city: z.string().optional(),
	state: z.string().optional(),
	zipCode: z.string().optional(),
	country: z.string().optional(),
}).or(z.object({
	personalInfo: z.object({
		firstName: z.string().min(1).max(50),
		lastName: z.string().min(1).max(50),
		username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/),
		email: z.string().email(),
		mobileNumber: z.object({
			countryCode: z.string().optional(),
			number: z.string().optional(),
		}).optional(),
		birthday: z.object({
			day: z.string().optional(),
			month: z.string().optional(),
			year: z.string().optional(),
		}).optional(),
		address: z.string().optional(),
		location: z.string().optional(),
		state: z.string().optional(),
		zipCode: z.string().optional(),
		country: z.string().optional(),
	}),
	password: z.string().min(8).max(100),
	referralCode: z.string().optional(),
}));

export const loginSchema = z.object({
	identifier: z.string().min(1, "Email or username is required"),
	password: z.string().min(1, "Password is required"),
});

export const passwordResetRequestSchema = z.object({
	email: z.string().email("Invalid email address"),
});

export const passwordResetVerifySchema = z.object({
	email: z.string().email("Invalid email address"),
	code: z.string().length(6, "OTP code must be 6 digits"),
	newPassword: z.string().min(8, "Password must be at least 8 characters").max(100),
});

// Withdrawal validation schema
export const withdrawalSchema = z.object({
	id: z.string().length(24, "Invalid user ID"),
	amount: z.number().positive("Amount must be positive").min(1, "Minimum withdrawal is $1"),
	convertedAmount: z.number().positive(),
	coinName: z.string().min(1, "Coin name is required"),
	network: z.string().min(1, "Network is required"),
	address: z.string().min(10, "Invalid wallet address"),
	autoWithdraw: z.boolean().optional(),
});

// Deposit validation schema
export const depositSchema = z.object({
	id: z.string().length(24, "Invalid user ID"),
	amount: z.number().positive("Amount must be positive").min(1, "Minimum deposit is $1"),
	convertedAmount: z.number().positive(),
	coinName: z.string().min(1, "Coin name is required"),
	network: z.string().min(1, "Network is required"),
	address: z.string().min(10, "Invalid wallet address"),
});

// Transfer validation schemas
export const internalTransferSchema = z.object({
	fromUserId: z.string().length(24, "Invalid sender user ID"),
	toUserId: z.string().length(24, "Invalid recipient user ID"),
	amount: z.number().positive("Amount must be positive").min(0.01, "Minimum transfer is $0.01"),
	currency: z.string().default("USD"),
	memo: z.string().max(500).optional(),
});

export const externalTransferSchema = z.object({
	userId: z.string().length(24, "Invalid user ID"),
	amount: z.number().positive("Amount must be positive").min(1, "Minimum transfer is $1"),
	currency: z.string().default("USD"),
	beneficiary: z.string().min(1, "Beneficiary name is required"),
	bankDetails: z.object({
		accountNumber: z.string().min(1),
		routingNumber: z.string().min(1),
		bankName: z.string().optional(),
	}),
	memo: z.string().max(500).optional(),
});

// Flight booking validation schema
export const flightBookingSchema = z.object({
	userId: z.string().length(24, "Invalid user ID"),
	amount: z.number().positive("Amount must be positive"),
	currency: z.string().default("USD"),
	route: z.string().optional(),
	vendor: z.string().optional(),
	fee: z.number().optional(),
});

// KYC submission validation schema
export const kycSubmissionSchema = z.object({
	documentFront: z.string().url("Invalid document front URL"),
	documentBack: z.string().url("Invalid document back URL"),
	documentNumber: z.string().min(1, "Document number is required"),
	documentExpDate: z.string().min(1, "Document expiry date is required"),
});

// Update user profile validation schema
export const updateProfileSchema = z.object({
	firstName: z.string().min(1).max(50).optional(),
	lastName: z.string().min(1).max(50).optional(),
	email: z.string().email().optional(),
	phone: z.string().optional(),
	streetAddress: z.string().optional(),
	city: z.string().optional(),
	state: z.string().optional(),
	zipCode: z.string().optional(),
	country: z.string().optional(),
});

// Admin update user validation schema
export const adminUpdateUserSchema = z.object({
	firstName: z.string().optional(),
	lastName: z.string().optional(),
	username: z.string().min(3).max(20).optional(),
	email: z.string().email().optional(),
	phone: z.string().optional(),
	streetAddress: z.string().optional(),
	city: z.string().optional(),
	state: z.string().optional(),
	zipCode: z.string().optional(),
	country: z.string().optional(),
	kycStatus: z.enum(["notSubmitted", "unverified", "pending", "approved", "rejected", "incomplete", "expired"]).optional(),
	accountStatus: z.enum(["active", "suspended", "deactivated", "pending_verification"]).optional(),
	accountNumber: z.string().optional(),
	routingNumber: z.string().optional(),
	wallets: z.array(z.object({
		chain: z.string(),
		asset: z.string(),
		address: z.string(),
		label: z.string(),
	})).optional(),
	password: z.string().min(8).max(100).optional(),
	deposit: z.number().optional(),
	interest: z.number().optional(),
	withdraw: z.number().optional(),
	bonus: z.number().optional(),
});
