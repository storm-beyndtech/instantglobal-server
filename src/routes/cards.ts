import express, { Response } from "express";
import mongoose from "mongoose";
import { Card } from "../models/card";
import { User } from "../models/user";
import { Transaction } from "../models/transaction";
import { requireAuth, requireAdmin, AuthRequest } from "../middleware/auth";

const router = express.Router();

// Generate a valid Luhn-compliant card number
const generateCardNumber = (prefix: string = "4532"): string => {
	// Generate random digits (12 digits after the prefix, leaving 1 for checksum)
	let cardNumber = prefix;
	for (let i = 0; i < 11; i++) {
		cardNumber += Math.floor(Math.random() * 10).toString();
	}

	// Calculate Luhn checksum
	let sum = 0;
	let isEven = true;
	for (let i = cardNumber.length - 1; i >= 0; i--) {
		let digit = parseInt(cardNumber[i], 10);
		if (isEven) {
			digit *= 2;
			if (digit > 9) digit -= 9;
		}
		sum += digit;
		isEven = !isEven;
	}
	const checkDigit = (10 - (sum % 10)) % 10;
	return cardNumber + checkDigit.toString();
};

// Generate CVV
const generateCVV = (): string => {
	return Math.floor(100 + Math.random() * 900).toString();
};

// Generate expiry (3 years from now)
const generateExpiry = (): { month: string; year: string; expiresAt: Date } => {
	const now = new Date();
	const expiresAt = new Date(now.getFullYear() + 3, now.getMonth(), 1);
	return {
		month: String(now.getMonth() + 1).padStart(2, "0"),
		year: String(expiresAt.getFullYear()).slice(-2),
		expiresAt,
	};
};

// Helper to calculate available balance
const getAvailableBalance = (user: any): number => {
	return (user.deposit || 0) + (user.interest || 0) + (user.bonus || 0) - (user.withdraw || 0);
};

// Get all cards for a user
router.get("/", requireAuth, async (req: AuthRequest, res: Response) => {
	try {
		const userId = req.user?.userId;
		const cards = await Card.find({ userId }).sort({ createdAt: -1 });

		res.json({
			cards: cards.map((card) => ({
				id: card._id,
				maskedNumber: `**** **** **** ${card.cardNumber.slice(-4)}`,
				last4: card.cardNumber.slice(-4),
				cardholderName: card.cardholderName,
				expiryMonth: card.expiryMonth,
				expiryYear: card.expiryYear,
				type: card.type,
				brand: card.brand,
				status: card.status,
				balance: card.balance,
				currency: card.currency,
				spendingLimit: card.spendingLimit,
				totalSpent: card.totalSpent,
				metadata: card.metadata,
				issuedAt: card.issuedAt,
				expiresAt: card.expiresAt,
			})),
			total: cards.length,
		});
	} catch (error: any) {
		console.error("Error fetching cards:", error);
		res.status(500).json({ message: "Failed to fetch cards" });
	}
});

// Get single card details (with sensitive data)
router.get("/:id", requireAuth, async (req: AuthRequest, res: Response) => {
	try {
		const { id } = req.params;
		const userId = req.user?.userId;

		const card = await Card.findOne({ _id: id, userId }).select("+cvv");
		if (!card) {
			return res.status(404).json({ message: "Card not found" });
		}

		res.json({
			id: card._id,
			cardNumber: card.cardNumber,
			cardholderName: card.cardholderName,
			expiryMonth: card.expiryMonth,
			expiryYear: card.expiryYear,
			cvv: card.cvv,
			type: card.type,
			brand: card.brand,
			status: card.status,
			balance: card.balance,
			currency: card.currency,
			spendingLimit: card.spendingLimit,
			dailyLimit: card.dailyLimit,
			monthlyLimit: card.monthlyLimit,
			totalSpent: card.totalSpent,
			lastUsed: card.lastUsed,
			metadata: card.metadata,
			issuedAt: card.issuedAt,
			expiresAt: card.expiresAt,
		});
	} catch (error: any) {
		console.error("Error fetching card:", error);
		res.status(500).json({ message: "Failed to fetch card" });
	}
});

// Issue a new virtual card
router.post("/issue", requireAuth, async (req: AuthRequest, res: Response) => {
	try {
		const userId = req.user?.userId;
		const { fundingAmount, purpose, label, color, brand = "visa" } = req.body;

		const user = await User.findById(userId);
		if (!user) {
			return res.status(404).json({ message: "User not found" });
		}

		const amount = Number(fundingAmount) || 0;
		const issuanceFee = Number(process.env.VIRTUAL_CARD_FEE) || 49;
		const totalDebit = amount + issuanceFee;

		// Balance validation
		const availableBalance = getAvailableBalance(user);
		if (availableBalance < totalDebit) {
			return res.status(400).json({
				message: `Insufficient balance. Available: $${availableBalance.toFixed(2)}, Required: $${totalDebit.toFixed(2)}`,
			});
		}

		// Deduct balance
		let remaining = totalDebit;
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
		if (remaining > 0) {
			user.bonus -= remaining;
		}

		await user.save();

		// Generate card details
		const prefix = brand === "mastercard" ? "5412" : "4532";
		const cardNumber = generateCardNumber(prefix);
		const cvv = generateCVV();
		const expiry = generateExpiry();

		// Create the card
		const card = await Card.create({
			userId,
			cardNumber,
			cardholderName: `${user.firstName} ${user.lastName}`.toUpperCase(),
			expiryMonth: expiry.month,
			expiryYear: expiry.year,
			cvv,
			type: "virtual",
			brand,
			status: "active",
			balance: amount,
			fundingAmount: amount,
			currency: "USD",
			metadata: {
				purpose: purpose || "",
				label: label || "Virtual Card",
				color: color || "purple",
			},
			expiresAt: expiry.expiresAt,
		});

		// Create transaction record
		await Transaction.create({
			type: "virtual_card_purchase",
			user: {
				id: user._id,
				email: user.email,
				name: `${user.firstName} ${user.lastName}`,
			},
			status: "completed",
			amount: totalDebit * -1,
			currency: "USD",
			description: `Virtual card issued - ${label || "Card"}`,
			metadata: {
				cardId: String(card._id),
				issuanceFee,
				fundingAmount: amount,
				last4: cardNumber.slice(-4),
			},
		});

		res.status(201).json({
			message: "Virtual card issued successfully",
			card: {
				id: String(card._id),
				maskedNumber: `**** **** **** ${cardNumber.slice(-4)}`,
				last4: cardNumber.slice(-4),
				cardholderName: card.cardholderName,
				expiryMonth: card.expiryMonth,
				expiryYear: card.expiryYear,
				brand: card.brand,
				status: card.status,
				balance: card.balance,
				metadata: card.metadata,
			},
			newBalance: getAvailableBalance(user),
		});
	} catch (error: any) {
		console.error("Error issuing card:", error);
		res.status(500).json({ message: "Failed to issue card" });
	}
});

// Fund an existing card
router.post("/:id/fund", requireAuth, async (req: AuthRequest, res: Response) => {
	try {
		const { id } = req.params;
		const { amount } = req.body;
		const userId = req.user?.userId;

		const fundAmount = Number(amount);
		if (!fundAmount || fundAmount <= 0) {
			return res.status(400).json({ message: "Invalid amount" });
		}

		const [card, user] = await Promise.all([
			Card.findOne({ _id: id, userId }),
			User.findById(userId),
		]);

		if (!card) {
			return res.status(404).json({ message: "Card not found" });
		}

		if (!user) {
			return res.status(404).json({ message: "User not found" });
		}

		if (card.status !== "active") {
			return res.status(400).json({ message: "Card is not active" });
		}

		// Balance validation
		const availableBalance = getAvailableBalance(user);
		if (availableBalance < fundAmount) {
			return res.status(400).json({
				message: `Insufficient balance. Available: $${availableBalance.toFixed(2)}`,
			});
		}

		// Deduct from user balance
		let remaining = fundAmount;
		if (user.deposit >= remaining) {
			user.deposit -= remaining;
		} else {
			remaining -= user.deposit;
			user.deposit = 0;
			if (remaining > 0) {
				user.interest -= remaining;
			}
		}

		// Add to card balance
		card.balance += fundAmount;

		await Promise.all([user.save(), card.save()]);

		// Create transaction
		await Transaction.create({
			type: "card_funding",
			user: { id: user._id, email: user.email, name: `${user.firstName} ${user.lastName}` },
			status: "completed",
			amount: fundAmount * -1,
			currency: "USD",
			description: `Card funding - **** ${card.cardNumber.slice(-4)}`,
			metadata: { cardId: String(card._id) },
		});

		res.json({
			message: "Card funded successfully",
			cardBalance: card.balance,
			accountBalance: getAvailableBalance(user),
		});
	} catch (error: any) {
		console.error("Error funding card:", error);
		res.status(500).json({ message: "Failed to fund card" });
	}
});

// Freeze/Unfreeze card
router.post("/:id/freeze", requireAuth, async (req: AuthRequest, res: Response) => {
	try {
		const { id } = req.params;
		const userId = req.user?.userId;

		const card = await Card.findOne({ _id: id, userId });
		if (!card) {
			return res.status(404).json({ message: "Card not found" });
		}

		if (card.status === "cancelled" || card.status === "expired") {
			return res.status(400).json({ message: "Cannot modify this card" });
		}

		card.status = card.status === "frozen" ? "active" : "frozen";
		await card.save();

		res.json({
			message: `Card ${card.status === "frozen" ? "frozen" : "unfrozen"} successfully`,
			status: card.status,
		});
	} catch (error: any) {
		console.error("Error freezing card:", error);
		res.status(500).json({ message: "Failed to update card" });
	}
});

// Cancel card (and refund remaining balance)
router.post("/:id/cancel", requireAuth, async (req: AuthRequest, res: Response) => {
	try {
		const { id } = req.params;
		const userId = req.user?.userId;

		const [card, user] = await Promise.all([
			Card.findOne({ _id: id, userId }),
			User.findById(userId),
		]);

		if (!card) {
			return res.status(404).json({ message: "Card not found" });
		}

		if (!user) {
			return res.status(404).json({ message: "User not found" });
		}

		if (card.status === "cancelled") {
			return res.status(400).json({ message: "Card is already cancelled" });
		}

		// Refund remaining balance
		const refundAmount = card.balance;
		if (refundAmount > 0) {
			user.deposit += refundAmount;
			await user.save();

			await Transaction.create({
				type: "card_refund",
				user: { id: user._id, email: user.email, name: `${user.firstName} ${user.lastName}` },
				status: "completed",
				amount: refundAmount,
				currency: "USD",
				description: `Card cancellation refund - **** ${card.cardNumber.slice(-4)}`,
				metadata: { cardId: String(card._id) },
			});
		}

		card.status = "cancelled";
		card.balance = 0;
		await card.save();

		res.json({
			message: "Card cancelled successfully",
			refundedAmount: refundAmount,
			accountBalance: getAvailableBalance(user),
		});
	} catch (error: any) {
		console.error("Error cancelling card:", error);
		res.status(500).json({ message: "Failed to cancel card" });
	}
});

// Update card limits (admin only)
router.put("/:id/limits", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
	try {
		const { id } = req.params;
		const { spendingLimit, dailyLimit, monthlyLimit } = req.body;

		const card = await Card.findById(id);
		if (!card) {
			return res.status(404).json({ message: "Card not found" });
		}

		if (spendingLimit !== undefined) card.spendingLimit = Number(spendingLimit);
		if (dailyLimit !== undefined) card.dailyLimit = Number(dailyLimit);
		if (monthlyLimit !== undefined) card.monthlyLimit = Number(monthlyLimit);

		await card.save();

		res.json({
			message: "Card limits updated",
			limits: {
				spendingLimit: card.spendingLimit,
				dailyLimit: card.dailyLimit,
				monthlyLimit: card.monthlyLimit,
			},
		});
	} catch (error: any) {
		console.error("Error updating card limits:", error);
		res.status(500).json({ message: "Failed to update limits" });
	}
});

// Get all cards (admin only)
router.get("/admin/all", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
	try {
		const { status, page = "1", limit = "20" } = req.query;

		const filter: any = {};
		if (status) filter.status = status;

		const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

		const [cards, total] = await Promise.all([
			Card.find(filter)
				.populate("userId", "email firstName lastName")
				.sort({ createdAt: -1 })
				.skip(skip)
				.limit(parseInt(limit as string)),
			Card.countDocuments(filter),
		]);

		res.json({
			cards,
			total,
			page: parseInt(page as string),
			totalPages: Math.ceil(total / parseInt(limit as string)),
		});
	} catch (error: any) {
		console.error("Error fetching all cards:", error);
		res.status(500).json({ message: "Failed to fetch cards" });
	}
});

export default router;
