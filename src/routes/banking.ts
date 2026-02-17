import express from "express";
import mongoose from "mongoose";
import { User } from "../models/user";
import { Transaction } from "../models/transaction";

import { requireAuth, requireAdmin, AuthRequest } from "../middleware/auth";

const router = express.Router();

const percent = (amount: number, pct: number) => +(amount * (pct / 100)).toFixed(2);
const parseAmount = (val: any) => {
	const n = Number(val);
	if (!Number.isFinite(n) || n <= 0) throw new Error("Invalid amount");
	return n;
};

// Helper to calculate user's available balance
const getAvailableBalance = (user: any): number => {
	return (user.deposit || 0) + (user.interest || 0) + (user.bonus || 0) - (user.withdraw || 0);
};

// Helper to validate and deduct balance
const validateAndDeductBalance = async (user: any, amount: number): Promise<{ success: boolean; message?: string }> => {
	const availableBalance = getAvailableBalance(user);
	if (availableBalance < amount) {
		return {
			success: false,
			message: `Insufficient balance. Available: $${availableBalance.toFixed(2)}, Required: $${amount.toFixed(2)}`
		};
	}

	// Deduct from deposit first, then interest, then bonus
	let remaining = amount;

	if (user.deposit >= remaining) {
		user.deposit -= remaining;
		remaining = 0;
	} else {
		remaining -= user.deposit;
		user.deposit = 0;
	}

	if (remaining > 0 && user.interest >= remaining) {
		user.interest -= remaining;
		remaining = 0;
	} else if (remaining > 0) {
		remaining -= user.interest;
		user.interest = 0;
	}

	if (remaining > 0 && user.bonus >= remaining) {
		user.bonus -= remaining;
		remaining = 0;
	} else if (remaining > 0) {
		remaining -= user.bonus;
		user.bonus = 0;
	}

	await user.save();
	return { success: true };
};

// Fetch account and wallet details for a user
router.get("/account/:userId", requireAuth, async (req: AuthRequest, res) => {
	try {
		const user = await User.findById(req.params.userId).select("accountNumber routingNumber wallets email firstName lastName");
		if (!user) return res.status(404).json({ message: "User not found" });
		res.json({
			id: user._id,
			accountNumber: user.accountNumber,
			routingNumber: user.routingNumber,
			wallets: user.wallets || [],
			name: `${user.firstName} ${user.lastName}`,
			email: user.email,
		});
	} catch (err: any) {
		res.status(500).json({ message: err.message || "Failed to fetch account" });
	}
});

// Internal transfer (platform users, zero fee)
router.post("/transfers/internal", requireAuth, async (req: AuthRequest, res) => {
	try {
		const { fromUserId, toUserId, amount, currency = "USD", memo } = req.body;
		const amt = parseAmount(amount);

		// SECURITY: Users can only transfer from their own account unless they're admin
		if (!req.user?.isAdmin && req.user?.userId !== fromUserId) {
			return res.status(403).json({ message: "Access denied: You can only transfer from your own account" });
		}

		const [fromUser, toUser] = await Promise.all([User.findById(fromUserId), User.findById(toUserId)]);
		if (!fromUser || !toUser) return res.status(404).json({ message: "User not found" });

		// SECURITY FIX: Check if sender has sufficient balance
		const senderBalance = fromUser.deposit + fromUser.interest;
		if (senderBalance < amt) {
			return res.status(400).json({ message: "Insufficient balance" });
		}

		// CRITICAL FIX: Actually modify user balances
		// Deduct from sender's deposit first, then interest if needed
		if (fromUser.deposit >= amt) {
			fromUser.deposit -= amt;
		} else {
			const remaining = amt - fromUser.deposit;
			fromUser.deposit = 0;
			fromUser.interest -= remaining;
		}

		// Credit to recipient's deposit
		toUser.deposit += amt;

		// Save both users and create transactions atomically
		await Promise.all([
			fromUser.save(),
			toUser.save(),
			Transaction.create({
				type: "internal_transfer",
				user: { id: fromUser._id, email: fromUser.email, name: `${fromUser.firstName} ${fromUser.lastName}` },
				status: "completed",
				amount: amt * -1,
				currency,
				description: memo || `Transfer to ${toUser.email}`,
				metadata: { toUserId: toUser._id.toString(), fee: 0 },
			}),
			Transaction.create({
				type: "internal_transfer",
				user: { id: toUser._id, email: toUser.email, name: `${toUser.firstName} ${toUser.lastName}` },
				status: "completed",
				amount: amt,
				currency,
				description: memo || `Transfer from ${fromUser.email}`,
				metadata: { fromUserId: fromUser._id.toString(), fee: 0 },
			}),
		]);

		res.json({ message: "Internal transfer completed", newBalance: fromUser.deposit + fromUser.interest });
	} catch (err: unknown) {
		const error = err as Error;
		console.error("Internal transfer error:", error);
		res.status(400).json({ message: error.message || "Internal transfer failed" });
	}
});

// External transfer (heavy fee, pending)
router.post("/transfers/external", requireAuth, async (req: AuthRequest, res) => {
	try {
		const { userId, amount, currency = "USD", beneficiary, bankDetails, memo } = req.body;
		const amt = parseAmount(amount);
		const user = await User.findById(userId);
		if (!user) return res.status(404).json({ message: "User not found" });

		// SECURITY: Users can only transfer from their own account unless admin
		if (!req.user?.isAdmin && req.user?.userId !== userId) {
			return res.status(403).json({ message: "Access denied: You can only transfer from your own account" });
		}

		const feePct = Number(process.env.EXTERNAL_TRANSFER_FEE_PERCENT || 2.5);
		const fee = percent(amt, feePct);
		const totalDebit = amt + fee;

		// BALANCE VALIDATION: Check if user has sufficient funds
		const balanceCheck = await validateAndDeductBalance(user, totalDebit);
		if (!balanceCheck.success) {
			return res.status(400).json({ message: balanceCheck.message });
		}

		const txn = await Transaction.create({
			type: "external_transfer",
			user: { id: user._id, email: user.email, name: `${user.firstName} ${user.lastName}` },
			status: "pending",
			amount: totalDebit * -1, // negative for debit
			currency,
			description: memo || `External transfer to ${beneficiary}`,
			metadata: { beneficiary, bankDetails, feePct, fee },
		});

		res.json({
			message: "External transfer created (pending)",
			transaction: txn,
			newBalance: getAvailableBalance(user)
		});
	} catch (err: any) {
		res.status(400).json({ message: err.message || "External transfer failed" });
	}
});

// Crypto deposit
router.post("/crypto/deposit", requireAuth, async (req: AuthRequest, res) => {
	try {
		const { userId, amount, currency = "USDC", address, chain = "ETH", memo } = req.body;
		const amt = parseAmount(amount);
		const user = await User.findById(userId);
		if (!user) return res.status(404).json({ message: "User not found" });

		const kind = "crypto_deposit";

		const txn = await Transaction.create({
			type: kind,
			user: { id: user._id, email: user.email, name: `${user.firstName} ${user.lastName}` },
			status: "pending",
			amount: amt,
			currency,
			description: memo || `${kind} ${chain}`,
			metadata: { address, chain },
		});

		res.json({ message: "Crypto deposit created (pending)", transaction: txn });
	} catch (err: any) {
		res.status(400).json({ message: err.message || "Crypto deposit failed" });
	}
});

// Crypto withdraw
router.post("/crypto/withdraw", requireAuth, async (req: AuthRequest, res) => {
	try {
		const { userId, amount, currency = "USDC", address, chain = "ETH", memo } = req.body;
		const amt = parseAmount(amount);
		const user = await User.findById(userId);
		if (!user) return res.status(404).json({ message: "User not found" });

		// SECURITY: Users can only withdraw from their own account unless admin
		if (!req.user?.isAdmin && req.user?.userId !== userId) {
			return res.status(403).json({ message: "Access denied: You can only withdraw from your own account" });
		}

		// BALANCE VALIDATION: Check if user has sufficient funds
		const balanceCheck = await validateAndDeductBalance(user, amt);
		if (!balanceCheck.success) {
			return res.status(400).json({ message: balanceCheck.message });
		}

		const kind = "crypto_withdrawal";

		const txn = await Transaction.create({
			type: kind,
			user: { id: user._id, email: user.email, name: `${user.firstName} ${user.lastName}` },
			status: "pending",
			amount: amt * -1,
			currency,
			description: memo || `${kind} ${chain}`,
			metadata: { address, chain },
		});

		res.json({
			message: "Crypto withdrawal created (pending)",
			transaction: txn,
			newBalance: getAvailableBalance(user)
		});
	} catch (err: any) {
		res.status(400).json({ message: err.message || "Crypto withdrawal failed" });
	}
});

// Gift card purchase
router.post("/giftcards/purchase", requireAuth, async (req: AuthRequest, res) => {
	try {
		const { userId, amount, currency = "USD", productId, fee } = req.body;
		const amt = parseAmount(amount);
		const feeAmount = Number(fee) || 0;
		const totalDebit = amt + feeAmount;

		const user = await User.findById(userId);
		if (!user) return res.status(404).json({ message: "User not found" });

		// SECURITY: Users can only purchase from their own account unless admin
		if (!req.user?.isAdmin && req.user?.userId !== userId) {
			return res.status(403).json({ message: "Access denied: You can only purchase from your own account" });
		}

		// BALANCE VALIDATION: Check if user has sufficient funds
		const balanceCheck = await validateAndDeductBalance(user, totalDebit);
		if (!balanceCheck.success) {
			return res.status(400).json({ message: balanceCheck.message });
		}

		const txn = await Transaction.create({
			type: "gift_card_purchase",
			user: { id: user._id, email: user.email, name: `${user.firstName} ${user.lastName}` },
			status: "completed",
			amount: totalDebit * -1,
			currency,
			description: `Gift card ${productId}`,
			metadata: { productId, fee: feeAmount },
		});

		res.json({
			message: "Gift card purchase completed",
			transaction: txn,
			newBalance: getAvailableBalance(user)
		});
	} catch (err: any) {
		res.status(400).json({ message: err.message || "Gift card purchase failed" });
	}
});

// Virtual card purchase
router.post("/virtual-cards/purchase", requireAuth, async (req: AuthRequest, res) => {
	try {
		const { userId, amount, currency = "USD", cardDetails, fee } = req.body;
		const amt = parseAmount(amount);
		const feeAmount = Number(fee) || Number(process.env.VIRTUAL_CARD_FEE) || 49;
		const totalDebit = amt + feeAmount;

		const user = await User.findById(userId);
		if (!user) return res.status(404).json({ message: "User not found" });

		// SECURITY: Users can only purchase from their own account unless admin
		if (!req.user?.isAdmin && req.user?.userId !== userId) {
			return res.status(403).json({ message: "Access denied: You can only purchase from your own account" });
		}

		// BALANCE VALIDATION: Check if user has sufficient funds
		const balanceCheck = await validateAndDeductBalance(user, totalDebit);
		if (!balanceCheck.success) {
			return res.status(400).json({ message: balanceCheck.message });
		}

		const txn = await Transaction.create({
			type: "virtual_card_purchase",
			user: { id: user._id, email: user.email, name: `${user.firstName} ${user.lastName}` },
			status: "completed",
			amount: totalDebit * -1,
			currency,
			description: `Virtual card issued`,
			metadata: { cardDetails, fee: feeAmount, fundingAmount: amt },
		});

		res.json({
			message: "Virtual card issued successfully",
			transaction: txn,
			newBalance: getAvailableBalance(user)
		});
	} catch (err: any) {
		res.status(400).json({ message: err.message || "Virtual card purchase failed" });
	}
});

// Flight booking
router.post("/flights/book", requireAuth, async (req: AuthRequest, res) => {
	try {
		const { userId, amount, currency = "USD", route, vendor, flightDetails, passengers } = req.body;
		const amt = parseAmount(amount);
		const feePct = Number(process.env.FLIGHT_BOOKING_FEE) || 1.8;
		const fee = percent(amt, feePct);
		const totalDebit = amt + fee;

		const user = await User.findById(userId);
		if (!user) return res.status(404).json({ message: "User not found" });

		// SECURITY: Users can only book from their own account unless admin
		if (!req.user?.isAdmin && req.user?.userId !== userId) {
			return res.status(403).json({ message: "Access denied: You can only book from your own account" });
		}

		// BALANCE VALIDATION: Check if user has sufficient funds
		const balanceCheck = await validateAndDeductBalance(user, totalDebit);
		if (!balanceCheck.success) {
			return res.status(400).json({ message: balanceCheck.message });
		}

		const txn = await Transaction.create({
			type: "flight_booking",
			user: { id: user._id, email: user.email, name: `${user.firstName} ${user.lastName}` },
			status: "completed",
			amount: totalDebit * -1,
			currency,
			description: route || "Flight booking",
			metadata: { vendor, fee, feePct, flightDetails, passengers, basePrice: amt },
		});

		res.json({
			message: "Flight booked successfully",
			transaction: txn,
			newBalance: getAvailableBalance(user),
			bookingDetails: {
				confirmationNumber: `IG${Date.now().toString(36).toUpperCase()}`,
				route,
				totalPaid: totalDebit,
				fee
			}
		});
	} catch (err: any) {
		res.status(400).json({ message: err.message || "Flight booking failed" });
	}
});

// Admin: approve transaction
router.post("/admin/transactions/:id/approve", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
	try {
		const { id } = req.params;
		const txn = await Transaction.findByIdAndUpdate(
			id,
			{ $set: { status: "completed", processedAt: new Date() } },
			{ new: true },
		);
		if (!txn) return res.status(404).json({ message: "Transaction not found" });
		res.json({ message: "Transaction approved", transaction: txn });
	} catch (err: any) {
		res.status(400).json({ message: err.message || "Approval failed" });
	}
});

// Admin: update wallet address
router.post("/admin/users/:id/wallets/:index", requireAuth, requireAdmin, async (req, res) => {
	try {
		const { id, index } = req.params;
		const { address } = req.body;
		const user = await User.findById(id);
		if (!user || !user.wallets || !user.wallets[Number(index)]) {
			return res.status(404).json({ message: "Wallet not found" });
		}
		user.wallets[Number(index)].address = address;
		await user.save();
		res.json({ message: "Wallet updated", wallets: user.wallets });
	} catch (err: any) {
		res.status(400).json({ message: err.message || "Update failed" });
	}
});

export default router;
