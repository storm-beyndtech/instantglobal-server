import express, { Request, Response } from "express";
import { Transaction } from "../models/transaction";
import { User } from "../models/user";
import { alertAdmin, withdrawRequested, withdrawStatus } from "../utils/mailer";
import { requireAuth, requireAdmin, requireSelfOrAdmin, AuthRequest } from "../middleware/auth";
import { validate, withdrawalSchema } from "../middleware/validation";
import { withdrawalLimiter } from "../middleware/rateLimiter";
import { logAudit } from "../utils/auditLogger";

const router = express.Router();

interface WithdrawalRequestBody {
	id: string;
	amount: number;
	convertedAmount: number;
	coinName: string;
	network: string;
	address: string;
	autoWithdraw?: boolean;
}

interface QueryParams {
	page?: string;
	limit?: string;
	search?: string;
	status?: string;
	userId?: string;
}

// Get withdrawals with basic filters (admin only)
router.get("/", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
	try {
		const page = String(req.query.page || "1");
		const limit = String(req.query.limit || "10");
		const search = String(req.query.search || "");
		const status = String(req.query.status || "all");
		const userId = String(req.query.userId || "");

		// Build filter
		interface FilterType {
			type: string;
			userId?: string;
			status?: string;
			$or?: Array<Record<string, RegExp>>;
		}

		const filter: FilterType = { type: "withdrawal" };

		if (userId) filter.userId = userId;
		if (status !== "all") filter.status = status;
		if (search) {
			const searchRegex = new RegExp(search, "i");
			filter.$or = [
				{ transactionNumber: searchRegex },
				{ "walletData.coinName": searchRegex },
				{ "walletData.network": searchRegex },
			];
		}

		// Pagination
		const skip = (parseInt(page) - 1) * parseInt(limit);

		const [withdrawals, total] = await Promise.all([
			Transaction.find(filter).sort({ date: -1 }).skip(skip).limit(parseInt(limit)),
			Transaction.countDocuments(filter),
		]);

		res.json({
			withdrawals,
			totalPages: Math.ceil(total / parseInt(limit)),
			currentPage: parseInt(page),
			totalWithdrawals: total,
		});
	} catch (e) {
		console.error("Error fetching withdrawals:", e);
		res.status(500).json({ message: "Failed to fetch withdrawals" });
	}
});

// Get supported coins and chains (manual mode - returns standard list)
router.get("/supported-coins", async (req: Request, res: Response) => {
	try {
		// Return a static list of supported currencies for manual processing
		const supportedCurrencies = [
			{ currency: "BTC", network: "Bitcoin" },
			{ currency: "ETH", network: "Ethereum" },
			{ currency: "USDT", network: "Ethereum (ERC20)" },
			{ currency: "USDT", network: "Tron (TRC20)" },
			{ currency: "USDC", network: "Ethereum (ERC20)" },
		];
		res.json(supportedCurrencies);
	} catch (error) {
		console.error("Error fetching supported currencies:", error);
		res.status(500).json({ message: "Error fetching supported currencies" });
	}
});

// Check withdrawal availability (manual mode - always requires approval)
router.post("/check-availability", async (req: Request, res: Response) => {
	try {
		// All withdrawals require manual approval in this mode
		res.json({
			available: false,
			balance: 0,
			message: "Manual approval required for all withdrawals"
		});
	} catch (error: any) {
		console.error("Error checking withdrawal availability:", error);
		res.status(500).json({
			available: false,
			balance: 0,
			message: "Manual approval required",
		});
	}
});

// Get all withdrawals by user (authenticated users can only see their own)
router.get("/user/:email", requireAuth, async (req: AuthRequest, res: Response) => {
	const { email } = req.params;

	// SECURITY: Users can only view their own withdrawals unless they're admin
	if (!req.user?.isAdmin && req.user?.email !== email) {
		return res.status(403).json({ message: "Access denied: You can only view your own withdrawals" });
	}

	try {
		const withdrawals = await Transaction.find({
			"user.email": email,
			type: "withdrawal",
		}).sort({ date: -1 });

		if (!withdrawals || withdrawals.length === 0) {
			return res.status(404).json({ message: "No withdrawals found for this user" });
		}

		res.json(withdrawals);
	} catch (e) {
		console.error("Error fetching user withdrawals:", e);
		res.status(500).json({ message: "Something went wrong" });
	}
});

// Getting single withdrawal (must be after specific routes)
router.get("/:id", requireAuth, async (req: AuthRequest, res: Response) => {
	const { id } = req.params;

	// Validate ObjectId format
	if (!id.match(/^[0-9a-fA-F]{24}$/)) {
		return res.status(400).json({ message: "Invalid withdrawal ID format" });
	}

	try {
		const withdrawal = await Transaction.findById(id);
		if (!withdrawal) return res.status(404).json({ message: "Transaction not found" });
		res.json(withdrawal);
	} catch (e) {
		console.error("Error fetching withdrawal:", e);
		res.status(500).json({ message: "Something went wrong" });
	}
});

// Making a withdrawal with NOWPayments integration
router.post("/", requireAuth, requireSelfOrAdmin, withdrawalLimiter, validate(withdrawalSchema), async (req: AuthRequest, res: Response) => {
	const { id, amount, convertedAmount, coinName, network, address, autoWithdraw = true } = req.body;

	try {
		const user = await User.findById(id);
		if (!user) return res.status(400).json({ message: "User not found" });

		// Check if there's any pending withdrawal for the user
		const pendingWithdrawal = await Transaction.findOne({
			userId: id,
			status: "pending",
			type: "withdrawal",
		});

		if (pendingWithdrawal) {
			return res.status(400).json({
				message: "You have a pending withdrawal. Please wait for approval.",
			});
		}

		// Check user balance
		const totalBalance = user.deposit + user.interest;
		if (amount > totalBalance) {
			return res.status(400).json({
				message: "Insufficient balance in your account.",
			});
		}

		const userData = {
			id: user._id,
			email: user.email,
			name: user.username,
		};

		const walletData = {
			convertedAmount,
			coinName,
			network,
			address,
		};

		// Create a new withdrawal instance (manual approval mode)
		const transaction = new Transaction({
			type: "withdrawal",
			user: userData,
			amount,
			walletData,
			status: "pending",
		});

		// Save transaction for manual approval
		await transaction.save();

		// Send admin alert for manual approval
		await alertAdmin(user.email, amount, transaction.date, "withdrawal");
		await withdrawRequested(user.email, user.fullName, amount, transaction.date);

		res.json({
			message: "Withdrawal request submitted and pending manual approval. Our team will process it within 24 hours.",
			status: "pending",
			estimatedTime: "Within 24 hours",
		});
	} catch (e: any) {
		console.error("Error processing withdrawal:", e);
		res.status(500).json({ message: "Something went wrong processing your withdrawal" });
	}
});

// Update withdrawal status and sync with NOWPayments (admin only)
router.put("/:id", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
	const { id } = req.params;
	const { status } = req.body;
	if (!["approved", "rejected", "processing", "pending"].includes(String(status))) {
		return res.status(400).json({ message: "Invalid status" });
	}

	try {
		let withdrawal = await Transaction.findById(id);
		if (!withdrawal) return res.status(404).json({ message: "Withdrawal not found" });
		const before = {
			status: withdrawal.status,
			amount: withdrawal.amount,
			userEmail: withdrawal.user?.email || "",
		};

		const userEmail = withdrawal.user?.email;
		let user = await User.findOne({ email: userEmail });
		if (!user) return res.status(400).json({ message: "User not found..." });
		if (user.isAdmin || user.role === "admin") {
			return res.status(403).json({ message: "Admin account balance mutation is restricted" });
		}
		const amount = Number(withdrawal.amount) || 0;

		const previousStatus = withdrawal.status;
		withdrawal.status = status;

		// If approving a manual withdrawal
		if (status === "approved" && previousStatus === "pending") {
			const totalBalance = user.deposit + user.interest;
			if (amount > totalBalance) {
				return res.status(400).json({ message: "Insufficient user balance." });
			}

			// Deduct from user balance
			if (user.deposit >= amount) {
				user.deposit -= amount;
			} else {
				const remaining = amount - user.deposit;
				user.deposit = 0;
				user.interest -= remaining;
			}
			user.withdraw += amount;
		}

		await user.save();
		await withdrawal.save();

		// Send confirmation email
		if (status === "approved" || status === "processing") {
			await withdrawStatus(user.email, user.fullName, amount, withdrawal.date, true);
		} else if (status === "rejected") {
			await withdrawStatus(user.email, user.fullName, amount, withdrawal.date, false);
		}
		await logAudit({
			req,
			action: "WITHDRAWAL_STATUS_UPDATED",
			actor: { userId: req.user?.userId, email: req.user?.email, isAdmin: req.user?.isAdmin },
			target: { entityType: "withdrawal", entityId: String(withdrawal._id), userId: String(user._id), email: user.email },
			before,
			after: {
				status: withdrawal.status,
				amount: withdrawal.amount,
				userEmail: user.email,
				userDeposit: user.deposit,
				userInterest: user.interest,
				userWithdraw: user.withdraw,
			},
			success: true,
			message: "Withdrawal updated",
		});

		res.json({ message: "Withdrawal successfully updated" });
	} catch (e: any) {
		console.error("Error updating withdrawal:", e);
		res.status(500).json({ message: "Something went wrong" });
	}
});

// Get withdrawal status (manual mode - returns DB status only)
router.get("/:id/status", requireAuth, async (req: AuthRequest, res: Response) => {
	const { id } = req.params;

	try {
		const withdrawal = await Transaction.findById(id);

		if (!withdrawal) {
			return res.status(404).json({ message: "Withdrawal not found" });
		}

		res.json({
			message: "Withdrawal status retrieved successfully",
			withdrawal: {
				id: withdrawal._id,
				status: withdrawal.status,
				amount: withdrawal.amount,
				date: withdrawal.date,
			}
		});
	} catch (error: any) {
		console.error("Error getting withdrawal status:", error);
		res.status(500).json({ message: "Error getting withdrawal status" });
	}
});

export default router;
