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

		const feePct = Number(process.env.EXTERNAL_TRANSFER_FEE_PERCENT || 2.5);
		const fee = percent(amt, feePct);

		const txn = await Transaction.create({
			type: "external_transfer",
			user: { id: user._id, email: user.email, name: `${user.firstName} ${user.lastName}` },
			status: "pending",
			amount: amt + fee, // debit includes fee
			currency,
			description: memo || `External transfer to ${beneficiary}`,
			metadata: { beneficiary, bankDetails, feePct, fee },
		});

		res.json({ message: "External transfer created (pending)", transaction: txn });
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

		res.json({ message: "Crypto withdrawal created (pending)", transaction: txn });
	} catch (err: any) {
		res.status(400).json({ message: err.message || "Crypto withdrawal failed" });
	}
});

// Gift card purchase
router.post("/giftcards/purchase", requireAuth, async (req: AuthRequest, res) => {
	try {
		const { userId, amount, currency = "USD", productId, fee } = req.body;
		const amt = parseAmount(amount);
		const user = await User.findById(userId);
		if (!user) return res.status(404).json({ message: "User not found" });

		const txn = await Transaction.create({
			type: "gift_card_purchase",
			user: { id: user._id, email: user.email, name: `${user.firstName} ${user.lastName}` },
			status: "pending",
			amount: amt + (Number(fee) || 0) * -1,
			currency,
			description: `Gift card ${productId}`,
			metadata: { productId, fee },
		});

		res.json({ message: "Gift card purchase recorded", transaction: txn });
	} catch (err: any) {
		res.status(400).json({ message: err.message || "Gift card purchase failed" });
	}
});

// Virtual card purchase
router.post("/virtual-cards/purchase", requireAuth, async (req: AuthRequest, res) => {
	try {
		const { userId, amount, currency = "USD", productId, fee } = req.body;
		const amt = parseAmount(amount);
		const user = await User.findById(userId);
		if (!user) return res.status(404).json({ message: "User not found" });

		const txn = await Transaction.create({
			type: "virtual_card_purchase",
			user: { id: user._id, email: user.email, name: `${user.firstName} ${user.lastName}` },
			status: "pending",
			amount: amt + (Number(fee) || 0) * -1,
			currency,
			description: `Virtual card ${productId}`,
			metadata: { productId, fee },
		});

		res.json({ message: "Virtual card purchase recorded", transaction: txn });
	} catch (err: any) {
		res.status(400).json({ message: err.message || "Virtual card purchase failed" });
	}
});

// Flight booking
router.post("/flights/book", requireAuth, async (req: AuthRequest, res) => {
	try {
		const { userId, amount, currency = "USD", route, vendor, fee } = req.body;
		const amt = parseAmount(amount);
		const user = await User.findById(userId);
		if (!user) return res.status(404).json({ message: "User not found" });

		const txn = await Transaction.create({
			type: "flight_booking",
			user: { id: user._id, email: user.email, name: `${user.firstName} ${user.lastName}` },
			status: "pending",
			amount: amt * -1,
			currency,
			description: route || "Flight booking",
			metadata: { vendor, fee },
		});

		res.json({ message: "Flight booking captured", transaction: txn });
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
