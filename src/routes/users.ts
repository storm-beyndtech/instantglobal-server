import express, { Request, Response } from "express";
import bcrypt from "bcryptjs";
import multer from "multer";
import path from "path";
import fs from "fs";
import { User } from "../models/user";
import { Transaction } from "../models/transaction";
import { Otp } from "../models/otp";
import { AuditLog } from "../models/auditLog";
import { welcomeMail, passwordResetCode, passwordResetConfirmation } from "../utils/mailer";
import { requireAdmin, requireAuth, requireSelfOrAdmin, AuthRequest } from "../middleware/auth";
import { validate, passwordResetRequestSchema, passwordResetVerifySchema, updateProfileSchema, kycSubmissionSchema, adminUpdateUserSchema } from "../middleware/validation";
import { passwordResetLimiter } from "../middleware/rateLimiter";
import { logAudit } from "../utils/auditLogger";

const router = express.Router();

const ADMIN_LOCKED_FIELDS = ["role", "isAdmin", "mfaSecret", "mfaBackupCodes", "mfaEnabledAt"];

function userSnapshot(user: any) {
	return {
		_id: String(user._id),
		email: user.email,
		username: user.username,
		role: user.role,
		isAdmin: user.isAdmin,
		accountStatus: user.accountStatus,
		kycStatus: user.kycStatus,
		deposit: user.deposit,
		interest: user.interest,
		withdraw: user.withdraw,
		bonus: user.bonus,
		accountNumber: user.accountNumber,
		routingNumber: user.routingNumber,
	};
}

// Multer configuration for profile image uploads
const storage = multer.diskStorage({
	destination: (req, file, cb) => {
		const uploadPath = path.join(__dirname, "../../uploads/profile-images");

		// Create directory if it doesn't exist
		if (!fs.existsSync(uploadPath)) {
			fs.mkdirSync(uploadPath, { recursive: true });
		}

		cb(null, uploadPath);
	},
	filename: (req, file, cb) => {
		// Generate unique filename
		const userId = req.body.userId || req.params.id;
		const timestamp = Date.now();
		const extension = path.extname(file.originalname);
		cb(null, `profile-${userId}-${timestamp}${extension}`);
	},
});

// File filter for images only
const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
	if (file.mimetype.startsWith("image/")) {
		cb(null, true);
	} else {
		cb(new Error("Only image files are allowed"));
	}
};

const upload = multer({
	storage,
	fileFilter,
	limits: {
		fileSize: 5 * 1024 * 1024, // 5MB limit
	},
});

// Get user profile (supports both direct ID and profile/:id formats)
router.get("/profile/:id", requireAuth, requireSelfOrAdmin, async (req: AuthRequest, res: Response) => {
	try {
		const userId = req.params.id;

		// Validate user ID
		if (!userId || userId === "undefined" || userId === "null") {
			return res.status(400).json({ message: "Invalid user ID provided" });
		}

		const user = await User.findById(userId).select("-password");
		if (!user) {
			return res.status(404).json({ message: "User not found" });
		}

    const userResponse = user.toObject();
    
		res.json({ success: true, user: { ...userResponse, id: userResponse._id } });
	} catch (error) {
		console.error("Error fetching user profile:", error);
		res.status(500).json({ message: "Server error" });
	}
});

// Get user profile by direct ID (for ProfileInfo component)
router.get("/:id", requireAuth, requireSelfOrAdmin, async (req: AuthRequest, res: Response) => {
	try {
		const user = await User.findById(req.params.id).select("-password");
		if (!user) {
			return res.status(404).json({ message: "User not found" });
		}
		res.json({ success: true, user });
	} catch (error) {
		console.error("Error fetching user profile:", error);
		res.status(500).json({ message: "Server error" });
	}
});

// Update user profile
router.put("/profile/:id", requireAuth, requireSelfOrAdmin, validate(updateProfileSchema), async (req: AuthRequest, res: Response) => {
	try {
		const { firstName, lastName, phone, streetAddress, city, state, zipCode, country } = req.body;

		const user = await User.findById(req.params.id);
		if (!user) {
			return res.status(404).json({ message: "User not found" });
		}

		// Update user fields
		if (firstName) user.firstName = firstName;
		if (lastName) user.lastName = lastName;
		if (phone) user.phone = phone;
		if (streetAddress) user.streetAddress = streetAddress;
		if (city) user.city = city;
		if (state) user.state = state;
		if (zipCode) user.zipCode = zipCode;
		if (country) user.country = country;

		await user.save();

		// Return updated user without password
		const updatedUser = await User.findById(req.params.id).select("-password");
		res.json({ message: "Profile updated successfully", user: updatedUser });
	} catch (error) {
		console.error("Error updating user profile:", error);
		res.status(500).json({ message: "Server error" });
	}
});

// Update user profile with file upload support
router.put("/update-profile", requireAuth, upload.single("profileImage"), async (req: AuthRequest, res: Response) => {
	try {
		const { userId, firstName, lastName, phone, streetAddress, city, state, zipCode, country, email } =
			req.body;

		if (!userId) {
			return res.status(400).json({ message: "User ID is required" });
		}

		// SECURITY: Users can only update their own profile unless they're admin
		if (!req.user?.isAdmin && req.user?.userId !== userId) {
			return res.status(403).json({ message: "Access denied: You can only update your own profile" });
		}

    const user = await User.findById(userId);
    
		if (!user) {
			return res.status(404).json({ message: "User not found" });
		}

		// Update user fields (only if provided and not empty)
		if (firstName && firstName.trim()) user.firstName = firstName.trim();
		if (lastName && lastName.trim()) user.lastName = lastName.trim();
		if (email && email.trim()) user.email = email.trim();
		if (phone && phone.trim()) user.phone = phone.trim();
		if (streetAddress && streetAddress.trim()) user.streetAddress = streetAddress.trim();
		if (city && city.trim()) user.city = city.trim();
		if (state && state.trim()) user.state = state.trim();
		if (zipCode && zipCode.trim()) user.zipCode = zipCode.trim();
		if (country && country.trim()) user.country = country.trim();

		// Handle profile image upload
		if (req.file) {
			// Delete old profile image if it exists
			if (user.profileImage) {
				const oldImagePath = path.join(
					__dirname,
					"../../uploads/profile-images",
					path.basename(user.profileImage),
				);
				if (fs.existsSync(oldImagePath)) {
					fs.unlinkSync(oldImagePath);
				}
			}

			// Set new profile image URL
			user.profileImage = `/uploads/profile-images/${req.file.filename}`;
		}

		await user.save();

		// Return updated user without password
		const updatedUser = await User.findById(userId).select("-password");
		res.json({ success: true, message: "Profile updated successfully", user: updatedUser });
	} catch (error) {
		console.error("Error updating user profile:", error);

		// Handle multer errors
		if (error instanceof multer.MulterError) {
			if (error.code === "LIMIT_FILE_SIZE") {
				return res.status(400).json({ success: false, message: "File size too large. Maximum size is 5MB." });
			}
			return res.status(400).json({ success: false, message: error.message });
		}

		res.status(500).json({ success: false, message: "Server error" });
	}
});

// Get user dashboard stats
router.get("/dashboard/:id", requireAuth, requireSelfOrAdmin, async (req: AuthRequest, res: Response) => {
	try {
		const userId = req.params.id;

		// Validate user ID
		if (!userId || userId === "undefined" || userId === "null") {
			return res.status(400).json({ message: "Invalid user ID provided" });
		}

		const user = await User.findById(userId).select("-password");
		if (!user) {
			return res.status(404).json({ message: "User not found" });
		}

		// Fetch user's transactions
		const userTransactions = await Transaction.find({ userId: userId }).sort({ date: -1 });

		// Calculate stats from transactions
		const investmentTransactions = userTransactions.filter((t) => t.type === "gold_investment");
		const depositTransactions = userTransactions.filter((t) => t.type === "deposit");
		const withdrawalTransactions = userTransactions.filter((t) => t.type === "withdrawal");

		const totalInvested = investmentTransactions.reduce((sum, t) => sum + t.amount, 0);
		const totalDeposits = depositTransactions.reduce((sum, t) => sum + t.amount, 0);
		const totalWithdrawals = withdrawalTransactions.reduce((sum, t) => sum + t.amount, 0);

		// Calculate gold ounces (assuming $2000 per ounce)
		const goldPricePerOunce = 2024.5;
		const goldOunces = totalInvested / goldPricePerOunce;

		const dashboardStats = {
			totalInvested,
			totalEarnings: user.interest,
			dailyEarnings: user.interest * 0.035,
			activeInvestments: investmentTransactions.filter((t) => t.status === "completed").length,
			goldOunces: parseFloat(goldOunces.toFixed(3)),
			portfolioValue: totalDeposits + user.interest - totalWithdrawals,
			recentInvestments: investmentTransactions.slice(0, 5),
			recentTransactions: userTransactions.slice(0, 10),
			totalDeposits,
			totalWithdrawals,
		};

		res.json(dashboardStats);
	} catch (error) {
		console.error("Error fetching dashboard stats:", error);
		res.status(500).json({ message: "Server error" });
	}
});

// Admin stats endpoint
router.get("/admin/stats", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
	try {
		// Fetch comprehensive admin statistics
		const [
			totalUsers,
			totalDeposits,
			totalWithdrawals,
			pendingDeposits,
			pendingWithdrawals,
			totalInvestments,
			totalRevenue,
		] = await Promise.all([
			User.countDocuments(),
			Transaction.countDocuments({ type: "deposit" }),
			Transaction.countDocuments({ type: "withdrawal" }),
			Transaction.countDocuments({ type: "deposit", status: "pending" }),
			Transaction.countDocuments({ type: "withdrawal", status: "pending" }),
			Transaction.countDocuments({ type: "gold_investment" }),
			Transaction.aggregate([
				{ $match: { type: "deposit", status: "approved" } },
				{ $group: { _id: null, total: { $sum: "$amount" } } },
			]),
		]);

		const adminStats = {
			users: {
				total: totalUsers,
				active: totalUsers, // Show all users as active since we're not filtering
				pending: 0, // Remove pending count since we're not filtering by status
				growth: 0, // Can be calculated with date comparison if needed
			},
			transactions: {
				deposits: {
					total: totalDeposits,
					pending: pendingDeposits,
				},
				withdrawals: {
					total: totalWithdrawals,
					pending: pendingWithdrawals,
				},
				investments: {
					total: totalInvestments,
				},
			},
			revenue: {
				total: totalRevenue[0]?.total || 0,
			},
		};

		res.json(adminStats);
	} catch (error) {
		console.error("Error fetching admin stats:", error);
		res.status(500).json({ message: "Server error" });
	}
});

// Admin audit logs endpoint
router.get("/admin/audit-logs", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
	try {
		const page = Math.max(1, parseInt(String(req.query.page || "1"), 10));
		const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || "50"), 10)));
		const action = String(req.query.action || "").trim();
		const actorId = String(req.query.actorId || "").trim();
		const targetId = String(req.query.targetId || "").trim();
		const success = String(req.query.success || "").trim();

		const filter: Record<string, any> = {};
		if (action) filter.action = action;
		if (actorId) filter["actor.userId"] = actorId;
		if (targetId) filter["target.entityId"] = targetId;
		if (success === "true" || success === "false") filter["outcome.success"] = success === "true";

		const skip = (page - 1) * limit;
		const [logs, total] = await Promise.all([
			AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
			AuditLog.countDocuments(filter),
		]);

		return res.json({
			logs,
			total,
			page,
			limit,
			totalPages: Math.ceil(total / limit),
		});
	} catch (error) {
		console.error("Error fetching audit logs:", error);
		return res.status(500).json({ message: "Failed to fetch audit logs" });
	}
});

// Password reset request
router.post("/password-reset/request", passwordResetLimiter, validate(passwordResetRequestSchema), async (req: Request, res: Response) => {
	try {
		const { email } = req.body;

		const user = await User.findOne({ email });
		if (!user) {
			return res.status(404).json({ message: "User not found" });
		}

		// Delete existing OTPs for this email
		await Otp.deleteMany({ email });

		// Create new OTP
		const otp = new Otp({ email });
		await otp.save();

		// Send reset code email
		await passwordResetCode(email, otp.code);

		res.json({ message: "Password reset code sent to your email" });
	} catch (error) {
		console.error("Error sending password reset:", error);
		res.status(500).json({ message: "Server error" });
	}
});

// Password reset verify and update
router.post("/password-reset/verify", passwordResetLimiter, validate(passwordResetVerifySchema), async (req: Request, res: Response) => {
	try {
		const { email, code, newPassword } = req.body;

		// Verify OTP
		const otp = await Otp.findOne({ email, code });
		if (!otp) {
			return res.status(400).json({ message: "Invalid or expired reset code" });
		}

		// Find user and update password
		const user = await User.findOne({ email });
		if (!user) {
			return res.status(404).json({ message: "User not found" });
		}

		// Hash new password
		const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS || "12");
		user.password = await bcrypt.hash(newPassword, saltRounds);
		await user.save();

		// Delete used OTP
		await Otp.deleteOne({ _id: otp._id });

		// Send confirmation email
		await passwordResetConfirmation(email);

		res.json({ message: "Password reset successful" });
	} catch (error) {
		console.error("Error resetting password:", error);
		res.status(500).json({ message: "Server error" });
	}
});

// Get all users (admin only)
router.get("/", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
	try {
		const { page = "1", limit = "10", search = "" } = req.query;

		// Build filter: exclude admin accounts from manage-users listing
		const filter: any = {
			$and: [{ isAdmin: { $ne: true } }, { role: { $ne: "admin" } }],
		};
		if (search) {
			const searchRegex = new RegExp(search as string, "i");
			filter.$and.push({
				$or: [
				{ username: searchRegex },
				{ email: searchRegex },
				{ firstName: searchRegex },
				{ lastName: searchRegex },
				],
			});
		}

		// Pagination
		const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

		const [users, total] = await Promise.all([
			User.find(filter)
				.select("-password")
				.sort({ createdAt: -1 })
				.skip(skip)
				.limit(parseInt(limit as string)),
			User.countDocuments(filter),
		]);

		res.json({
			users,
			totalPages: Math.ceil(total / parseInt(limit as string)),
			currentPage: parseInt(page as string),
			totalUsers: total,
		});
	} catch (error) {
		console.error("Error fetching users:", error);
		res.status(500).json({ message: "Server error" });
	}
});

// Update user status (admin only)
router.put("/:id/status", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
	try {
		const { accountStatus, kycStatus } = req.body;
		const forbidden = ADMIN_LOCKED_FIELDS.filter((field) => field in req.body);
		if (forbidden.length) {
			await logAudit({
				req,
				action: "USER_STATUS_UPDATE_BLOCKED",
				actor: { userId: req.user?.userId, email: req.user?.email, isAdmin: req.user?.isAdmin },
				target: { entityType: "user", entityId: req.params.id },
				success: false,
				message: `Attempted forbidden fields: ${forbidden.join(", ")}`,
			});
			return res.status(403).json({ message: "Forbidden fields in request" });
		}

		const user = await User.findById(req.params.id);
		if (!user) {
			return res.status(404).json({ message: "User not found" });
		}
		if (user.isAdmin || user.role === "admin") {
			return res.status(403).json({ message: "Admin account mutation is restricted" });
		}
		const before = userSnapshot(user);

		if (accountStatus) user.accountStatus = accountStatus;
		if (kycStatus) {
			user.kycStatus = kycStatus;

			// Send welcome email if KYC is approved
			if (kycStatus === "approved" && !user.isEmailVerified) {
				await welcomeMail(user.email, user.fullName);
				user.isEmailVerified = true;
			}
		}

		await user.save();
		await logAudit({
			req,
			action: "USER_STATUS_UPDATED",
			actor: { userId: req.user?.userId, email: req.user?.email, isAdmin: req.user?.isAdmin },
			target: { entityType: "user", entityId: String(user._id), userId: String(user._id), email: user.email },
			before,
			after: userSnapshot(user),
			success: true,
			message: "User status updated",
		});

		res.json({ message: "User status updated successfully" });
	} catch (error) {
		console.error("Error updating user status:", error);
		res.status(500).json({ message: "Server error" });
	}
});

// Submit KYC verification (user initiated)
router.post("/kyc/submit/:id", requireAuth, requireSelfOrAdmin, validate(kycSubmissionSchema), async (req: AuthRequest, res: Response) => {
	try {
		const { documentFront, documentBack, documentNumber, documentExpDate } = req.body;

		const user = await User.findById(req.params.id);
		if (!user) {
			return res.status(404).json({ message: "User not found" });
		}

		// Only allow submission if KYC is unverified or rejected
		if (user.kycStatus !== "unverified" && user.kycStatus !== "rejected") {
			return res.status(400).json({
				message: `KYC verification cannot be submitted. Current status: ${user.kycStatus}`,
			});
		}

		// Update KYC documents and set status to pending
		user.documentFront = documentFront;
		user.documentBack = documentBack;
		user.documentNumber = documentNumber;
		user.documentExpDate = documentExpDate;
		user.kycStatus = "pending";

		await user.save();

		// Return updated user without password
		const updatedUser = await User.findById(req.params.id).select("-password");

		res.json({
			success: true,
			message: "KYC verification submitted successfully. Documents are under review.",
			user: updatedUser,
		});
	} catch (error) {
		console.error("Error submitting KYC:", error);
		res.status(500).json({ message: "Server error" });
	}
});

// Get KYC status for user
router.get("/kyc/status/:id", requireAuth, requireSelfOrAdmin, async (req: AuthRequest, res: Response) => {
	try {
		const user = await User.findById(req.params.id).select("kycStatus documentNumber documentExpDate");
		if (!user) {
			return res.status(404).json({ message: "User not found" });
		}

		res.json({
			success: true,
			kycStatus: user.kycStatus,
			hasDocuments: !!(user.documentNumber && user.documentExpDate),
		});
	} catch (error) {
		console.error("Error fetching KYC status:", error);
		res.status(500).json({ message: "Server error" });
	}
});


// Delete user (admin only)
router.delete("/:identifier", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
	try {
		const { identifier } = req.params;

		// Try to find user by ID or email
		let user;
		if (identifier.includes("@")) {
			// If identifier contains @, treat it as email
			user = await User.findOne({ email: identifier });
		} else {
			// Otherwise try as MongoDB ObjectId
			user = await User.findById(identifier);
		}

		if (!user) {
			return res.status(404).json({ message: "User not found" });
		}
		if (user.isAdmin || user.role === "admin") {
			await logAudit({
				req,
				action: "USER_DELETE_BLOCKED",
				actor: { userId: req.user?.userId, email: req.user?.email, isAdmin: req.user?.isAdmin },
				target: { entityType: "user", entityId: String(user._id), userId: String(user._id), email: user.email },
				success: false,
				message: "Attempted deletion of admin account",
			});
			return res.status(403).json({ message: "Admin account deletion is restricted" });
		}
		const before = userSnapshot(user);

		// Delete user's transactions first
		await Transaction.deleteMany({ userId: user._id });

		// Delete user's OTPs
		await Otp.deleteMany({ email: user.email });

		// Delete user's profile image if exists
		if (user.profileImage) {
			const imagePath = path.join(__dirname, "../../uploads/profile-images", path.basename(user.profileImage));
			if (fs.existsSync(imagePath)) {
				fs.unlinkSync(imagePath);
			}
		}

		// Delete the user
		await User.findByIdAndDelete(user._id);
		await logAudit({
			req,
			action: "USER_DELETED",
			actor: { userId: req.user?.userId, email: req.user?.email, isAdmin: req.user?.isAdmin },
			target: { entityType: "user", entityId: String(user._id), userId: String(user._id), email: user.email },
			before,
			after: null,
			success: true,
			message: "User deleted",
		});

		res.json({ message: "User deleted successfully" });
	} catch (error) {
		console.error("Error deleting user:", error);
		res.status(500).json({ message: "Server error" });
	}
});

// Recipient lookup for transfers - supports email or account/routing (authenticated users only)
router.get("/lookup", requireAuth, async (req: AuthRequest, res: Response) => {
	try {
		const { email, accountNumber, routingNumber } = req.query;

		const hasEmail = typeof email === "string" && email.trim().length > 3;
		const hasAccountRouting =
			typeof accountNumber === "string" &&
			accountNumber.trim().length > 0 &&
			typeof routingNumber === "string" &&
			routingNumber.trim().length > 0;

		if (!hasEmail && !hasAccountRouting) {
			return res.status(400).json({
				exists: false,
				message: "Provide an email or both accountNumber and routingNumber",
			});
		}

		const orFilters: Record<string, string>[] = [];

		if (hasEmail) {
			orFilters.push({ email: (email as string).toLowerCase().trim() });
		}

		if (hasAccountRouting) {
			orFilters.push({
				accountNumber: (accountNumber as string).trim(),
				routingNumber: (routingNumber as string).trim(),
			});
		}

		const user = await User.findOne({ $or: orFilters }).select(
			"_id firstName lastName email accountNumber routingNumber accountStatus",
		);

		if (!user) {
			return res.json({
				exists: false,
				message: "No account found for the provided details",
			});
		}

		if (user.accountStatus !== "active") {
			return res.json({
				exists: true,
				user: null,
				message: `Account exists but is ${user.accountStatus}. Transfers are not allowed.`,
			});
		}

		res.json({
			exists: true,
			user: {
				id: user._id,
				name: `${user.firstName} ${user.lastName}`,
				email: user.email,
				accountNumber: user.accountNumber,
				routingNumber: user.routingNumber,
			},
			message: "Recipient found and verified",
		});
	} catch (error) {
		console.error("Error looking up user:", error);
		res.status(500).json({ message: "Server error" });
	}
});

// Admin: update user profile, credentials, balances, and KYC/account status
router.put("/admin/:id", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
	try {
		const { id } = req.params;
		const forbidden = ADMIN_LOCKED_FIELDS.filter((field) => field in req.body);
		if (forbidden.length) {
			await logAudit({
				req,
				action: "USER_ADMIN_UPDATE_BLOCKED",
				actor: { userId: req.user?.userId, email: req.user?.email, isAdmin: req.user?.isAdmin },
				target: { entityType: "user", entityId: id },
				success: false,
				message: `Attempted forbidden fields: ${forbidden.join(", ")}`,
			});
			return res.status(403).json({ message: "role/isAdmin and security fields cannot be updated via this endpoint" });
		}
		const {
			firstName,
			lastName,
			username,
			email,
			phone,
			streetAddress,
			city,
			state,
			zipCode,
			country,
			kycStatus,
			accountStatus,
			accountNumber,
			routingNumber,
			wallets,
			password,
			deposit,
			interest,
			withdraw,
			bonus,
		} = req.body;

		const user = await User.findById(id);
		if (!user) {
			return res.status(404).json({ message: "User not found" });
		}
		if (user.isAdmin || user.role === "admin") {
			return res.status(403).json({ message: "Admin account mutation is restricted" });
		}
		const before = userSnapshot(user);

		// Basic profile
		if (firstName) user.firstName = firstName;
		if (lastName) user.lastName = lastName;
		if (username) user.username = username;
		if (email) user.email = email;
		if (phone) user.phone = phone;
		if (streetAddress) user.streetAddress = streetAddress;
		if (city) user.city = city;
		if (state) user.state = state;
		if (zipCode) user.zipCode = zipCode;
		if (country) user.country = country;

		// Banking identifiers
		if (accountNumber) user.accountNumber = accountNumber;
		if (routingNumber) user.routingNumber = routingNumber;
		if (Array.isArray(wallets)) {
			user.wallets = wallets;
		}

		// Status toggles
		if (kycStatus) {
			user.kycStatus = kycStatus;
			user.idVerified = kycStatus === "approved";
		}
		if (accountStatus) user.accountStatus = accountStatus;

		// Balance adjustments (admin supplied absolute values)
		const numericUpdates: Record<string, any> = { deposit, interest, withdraw, bonus };
		for (const [key, val] of Object.entries(numericUpdates)) {
			if (val !== undefined) {
				const num = Number(val);
				if (!Number.isFinite(num)) {
					return res.status(400).json({ message: `Invalid numeric value for ${key}` });
				}
				// @ts-ignore
				user[key] = num;
			}
		}

		// Password reset
		if (password && password.trim().length >= 6) {
			const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS || "12", 10);
			user.password = await bcrypt.hash(password.trim(), saltRounds);
		}

		await user.save();
		await logAudit({
			req,
			action: "USER_ADMIN_UPDATED",
			actor: { userId: req.user?.userId, email: req.user?.email, isAdmin: req.user?.isAdmin },
			target: { entityType: "user", entityId: String(user._id), userId: String(user._id), email: user.email },
			before,
			after: userSnapshot(user),
			success: true,
			message: "Admin user update applied",
		});
		const sanitized = await User.findById(id).select("-password");
		return res.json({ message: "User updated", user: sanitized });
	} catch (error: any) {
		console.error("Admin update user error:", error);
		res.status(500).json({ message: error.message || "Failed to update user" });
	}
});

export default router;
