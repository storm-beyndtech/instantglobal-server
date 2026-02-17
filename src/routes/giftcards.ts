import { Router, Request, Response } from "express";
import GiftCard from "../models/giftcard";
import { User } from "../models/user";
import { Transaction } from "../models/transaction";
import { requireAuth, AuthRequest } from "../middleware/auth";

const router = Router();

// Issuance fee in USD
const GIFT_CARD_FEE = Number(process.env.GIFT_CARD_FEE) || 4.5;

// Helper to get available balance
const getAvailableBalance = (user: any): number => {
  return (user.deposit || 0) + (user.interest || 0) + (user.bonus || 0) - (user.withdraw || 0);
};

// Helper to validate and deduct balance
const validateAndDeductBalance = async (
  user: any,
  amount: number
): Promise<{ success: boolean; message?: string }> => {
  const availableBalance = getAvailableBalance(user);
  if (availableBalance < amount) {
    return {
      success: false,
      message: `Insufficient balance. Available: $${availableBalance.toFixed(2)}, Required: $${amount.toFixed(2)}`,
    };
  }

  let remaining = amount;
  if (user.deposit >= remaining) {
    user.deposit -= remaining;
    remaining = 0;
  } else {
    remaining -= user.deposit;
    user.deposit = 0;
    if (user.interest >= remaining) {
      user.interest -= remaining;
      remaining = 0;
    } else {
      remaining -= user.interest;
      user.interest = 0;
      user.bonus -= remaining;
    }
  }

  await user.save();
  return { success: true };
};

// GET /api/giftcards - List user's gift cards
router.get("/", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const giftcards = await GiftCard.find({ issuedBy: userId })
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      giftcards: giftcards.map((gc) => ({
        id: String(gc._id),
        code: gc.code,
        amount: gc.amount,
        currency: gc.currency,
        status: gc.status,
        recipient: gc.recipient,
        createdAt: gc.createdAt,
        expiresAt: gc.expiresAt,
      })),
      total: giftcards.length,
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message || "Failed to fetch gift cards" });
  }
});

// POST /api/giftcards/issue - Issue a new gift card
router.post("/issue", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { amount, recipient, currency = "USD" } = req.body;

    const cardAmount = Number(amount);
    if (isNaN(cardAmount) || cardAmount < 10) {
      return res.status(400).json({ message: "Minimum gift card amount is $10" });
    }

    if (cardAmount > 1000) {
      return res.status(400).json({ message: "Maximum gift card amount is $1,000" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const totalCost = cardAmount + GIFT_CARD_FEE;

    // Validate balance
    const balanceCheck = await validateAndDeductBalance(user, totalCost);
    if (!balanceCheck.success) {
      return res.status(400).json({ message: balanceCheck.message });
    }

    // Generate unique code
    let code: string;
    let attempts = 0;
    do {
      code = GiftCard.generateCode();
      const exists = await GiftCard.findOne({ code });
      if (!exists) break;
      attempts++;
    } while (attempts < 10);

    if (attempts >= 10) {
      return res.status(500).json({ message: "Failed to generate unique code" });
    }

    // Set expiry to 1 year from now
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);

    // Create gift card
    const giftcard = await GiftCard.create({
      code,
      amount: cardAmount,
      currency,
      status: "active",
      issuedBy: userId,
      recipient: recipient || undefined,
      expiresAt,
    });

    // Create transaction record
    await Transaction.create({
      type: "gift_card_purchase",
      user: { id: user._id, email: user.email, name: `${user.firstName} ${user.lastName}` },
      status: "completed",
      amount: totalCost * -1,
      currency,
      description: `Gift card ${code} - $${cardAmount}`,
      metadata: {
        giftCardId: String(giftcard._id),
        giftCardCode: code,
        cardAmount,
        fee: GIFT_CARD_FEE,
        recipient,
      },
    });

    res.json({
      message: "Gift card issued successfully",
      giftcard: {
        id: String(giftcard._id),
        code: giftcard.code,
        amount: giftcard.amount,
        currency: giftcard.currency,
        status: giftcard.status,
        recipient: giftcard.recipient,
        expiresAt: giftcard.expiresAt,
        createdAt: giftcard.createdAt,
      },
      fee: GIFT_CARD_FEE,
      totalCharged: totalCost,
      newBalance: getAvailableBalance(user),
    });
  } catch (err: any) {
    res.status(400).json({ message: err.message || "Failed to issue gift card" });
  }
});

// POST /api/giftcards/redeem - Redeem a gift card
router.post("/redeem", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { code } = req.body;

    if (!code || typeof code !== "string") {
      return res.status(400).json({ message: "Gift card code is required" });
    }

    const giftcard = await GiftCard.findOne({ code: code.toUpperCase() });
    if (!giftcard) {
      return res.status(404).json({ message: "Gift card not found" });
    }

    if (giftcard.status !== "active") {
      return res.status(400).json({ message: `Gift card is ${giftcard.status}` });
    }

    if (giftcard.expiresAt && giftcard.expiresAt < new Date()) {
      giftcard.status = "expired";
      await giftcard.save();
      return res.status(400).json({ message: "Gift card has expired" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Credit the user
    user.deposit = (user.deposit || 0) + giftcard.amount;
    await user.save();

    // Mark gift card as redeemed
    giftcard.status = "redeemed";
    giftcard.redeemedBy = user._id as any;
    giftcard.redeemedAt = new Date();
    await giftcard.save();

    // Create transaction
    await Transaction.create({
      type: "gift_card_redemption",
      user: { id: user._id, email: user.email, name: `${user.firstName} ${user.lastName}` },
      status: "completed",
      amount: giftcard.amount,
      currency: giftcard.currency,
      description: `Gift card redeemed - ${code}`,
      metadata: { giftCardId: String(giftcard._id), giftCardCode: code },
    });

    res.json({
      message: "Gift card redeemed successfully",
      amount: giftcard.amount,
      newBalance: getAvailableBalance(user),
    });
  } catch (err: any) {
    res.status(400).json({ message: err.message || "Failed to redeem gift card" });
  }
});

// GET /api/giftcards/:id - Get gift card details
router.get("/:id", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { id } = req.params;

    const giftcard = await GiftCard.findById(id);
    if (!giftcard) {
      return res.status(404).json({ message: "Gift card not found" });
    }

    // Only allow owner to view full details
    if (String(giftcard.issuedBy) !== userId && !req.user?.isAdmin) {
      return res.status(403).json({ message: "Access denied" });
    }

    res.json({
      id: String(giftcard._id),
      code: giftcard.code,
      amount: giftcard.amount,
      currency: giftcard.currency,
      status: giftcard.status,
      recipient: giftcard.recipient,
      expiresAt: giftcard.expiresAt,
      createdAt: giftcard.createdAt,
      redeemedAt: giftcard.redeemedAt,
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message || "Failed to fetch gift card" });
  }
});

export default router;
