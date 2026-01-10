import express from "express";
import { Transaction } from "../models/transaction";
import { User } from "../models/user";
import {
  alertAdmin,
  depositRequested,
  depositStatus,
  referralCommission,
} from "../utils/mailer";
import { requireAuth, requireAdmin, requireSelfOrAdmin, AuthRequest } from "../middleware/auth";
import { validate, depositSchema } from "../middleware/validation";
import { depositLimiter } from "../middleware/rateLimiter";

const router = express.Router();

// GET: All deposits (admin only)
router.get("/", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const deposits = await Transaction.find({ type: "deposit" })
      .sort({ date: -1 })
      .lean();

    res.json(deposits);
  } catch (error) {
    console.error("Fetch deposits error:", error);
    res.status(500).json({ message: "Failed to fetch deposits" });
  }
});

// POST: Create deposit request
router.post("/", requireAuth, requireSelfOrAdmin, depositLimiter, validate(depositSchema), async (req: AuthRequest, res) => {
  const { id, amount, convertedAmount, coinName, network, address } = req.body;

  if (!id || !amount || !coinName) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  try {
    const user = await User.findById(id);
    if (!user) return res.status(400).json({ message: "User not found" });

    // Block multiple pending deposits
    const hasPending = await Transaction.exists({
      "user.id": id,
      type: "deposit",
      status: "pending",
    });
    if (hasPending) {
      return res.status(400).json({ message: "You already have a pending deposit" });
    }

    const transaction = new Transaction({
      type: "deposit",
      user: { id: user._id, email: user.email, name: user.username },
      amount,
      walletData: { convertedAmount, coinName, network, address },
    });

    await transaction.save();

    // Notify admin & user (don't fail the request if emails fail)
    try {
      await Promise.all([
        alertAdmin(user.email, amount, transaction.date, "deposit"),
        depositRequested(user.email, user.fullName, amount, transaction.date),
      ]);
    } catch (emailError) {
      console.error("Email notification failed (non-critical):", emailError);
      // Continue anyway - emails are not critical to deposit creation
    }

    res.json({ message: "Deposit request sent. Awaiting approval." });
  } catch (error) {
    console.error("Create deposit error:", error);
    res.status(500).json({ message: "Deposit failed" });
  }
});

// PUT: Approve or reject deposit (admin only)
router.put("/:id", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { email, amount, status } = req.body;

  if (!["approved", "rejected"].includes(status)) {
    return res.status(400).json({ message: "Invalid status" });
  }

  try {
    const deposit = await Transaction.findById(id);
    if (!deposit) return res.status(404).json({ message: "Deposit not found" });

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "User not found" });

    deposit.status = status;
    await deposit.save();

    if (status === "approved") {
      user.deposit += amount;
      await user.save();

      // Give 5% referral bonus
      if (user.referral?.code) {
        const referrer = await User.findOne({ username: user.referral.code });
        if (referrer) {
          const bonus = amount * 0.05;
          referrer.deposit += bonus;
          await referrer.save();
          await referralCommission(
            referrer.email,
            referrer.fullName,
            bonus,
            user.fullName
          );
        }
      }

      await depositStatus(user.email, user.fullName, amount, deposit.date, true);
    } else {
      await depositStatus(user.email, user.fullName, amount, deposit.date, false);
    }

    res.json({ message: `Deposit ${status}` });
  } catch (error) {
    console.error("Update deposit error:", error);
    res.status(500).json({ message: "Update failed" });
  }
});

// DELETE: Remove a deposit (admin only)
router.delete("/:id", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const { id } = req.params;

  try {
    const deposit = await Transaction.findByIdAndDelete(id);
    if (!deposit) return res.status(404).json({ message: "Deposit not found" });

    res.json({ message: "Deposit deleted successfully" });
  } catch (error) {
    console.error("Delete deposit error:", error);
    res.status(500).json({ message: "Delete failed" });
  }
});

export default router;