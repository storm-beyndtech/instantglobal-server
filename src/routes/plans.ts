import express, { Request, Response } from "express";
import { Plan } from "../models/plan";
import { Transaction } from "../models/transaction";
import { User } from "../models/user";
import {
	alertAdmin,
	contractApproved,
	contractCompleted,
	contractRejected
} from "../utils/mailer";

const router = express.Router();

// GET /api/plans - Get all active plans
router.get("/", async (req, res) => {
	try {
		const plans = await Plan.find({ isActive: true }).sort({ createdAt: -1 });
		res.json(plans);
	} catch (error) {
		console.error("Error fetching plans:", error);
		res.status(500).json({ message: "Failed to fetch plans" });
	}
});

// POST /api/plans/contract - Create contract (User)
router.post("/contract", async (req, res) => {
	try {
		const { planId, amount, userId, interest } = req.body;

		// Get plan
		const plan = await Plan.findById(planId);
		if (!plan || !plan.isActive) {
			return res.status(404).json({ message: "Plan not found" });
		}

		// Check minimum amount
		if (amount < plan.minAmount) {
			return res.status(400).json({ message: `Minimum amount is $${plan.minAmount}` });
		}

		// Get user and check balance
		const user = await User.findById(userId);
		if (!user) {
			return res.status(404).json({ message: "User not found" });
		}

		// Check if user has sufficient balance
		if (user.deposit < amount) {
			return res.status(400).json({
				message: `Insufficient balance. Available: $${user.deposit}`,
			});
		}

		// Deduct amount from user balance
		user.deposit -= amount;
		await user.save();

		// Create contract transaction with auto-activation
		const transaction = new Transaction({
			type: "contract",
			user: {
				id: userId,
				email: user.email,
				name: user.username,
			},
			status: "active", // Auto-activate contracts
			amount: amount,
			planData: {
				plan: plan.name,
				duration: plan.duration,
				interest: interest || (amount * plan.roi) / 100,
			},
		});

		await transaction.save();
		
		// Send approval notification instead of request notification
		await contractApproved(user.email, user.fullName, amount, transaction.date, plan.name);
		await alertAdmin(user.email, amount, transaction.date, "contract");
		res.status(201).json({
			message: "Contract created successfully",
			remainingBalance: user.deposit,
		});
	} catch (error: any) {
		res.status(500).json({ message: error.message });
	}
});

// PUT /api/plans/contract/:id - Update contract status (Admin)
router.put("/contract/:id", async (req, res) => {
	try {
		const { id } = req.params;
		const { status } = req.body; // 'approved', 'rejected', 'completed'

		const transaction = await Transaction.findById(id);
		if (!transaction || transaction.type !== "contract") {
			return res.status(404).json({ message: "Contract not found" });
		}

		// Find user and update their balance
		const user = await User.findById(transaction.user ? transaction.user.id : "");
		if (!user) {
			return res.status(404).json({ message: "User not found" });
		}

		// Update status
		transaction.status = status;

		if (status === "rejected") {
			// If rejected, refund amount to user balance
			user.deposit += Number(transaction.amount);
			transaction.amount = 0;
			await user.save();
			await contractRejected(
				user.email,
				user.fullName,
				transaction.amount,
				transaction.date,
				transaction.planData ? transaction.planData.plan : "",
			);
		}
		if (status === "active") {
			await contractApproved(
				user.email,
				user.fullName,
				transaction.amount,
				transaction.date,
				transaction.planData ? transaction.planData.plan : "",
			);
		}

		// If completed, add interest to amount and fund user balance
		if (status === "completed") {
			if (user) {
				user.deposit += Number(transaction.amount);
				user.interest += Number(transaction.planData ? transaction.planData.interest : "");
				await user.save();
			}

			await contractCompleted(
				user.email,
				user.fullName,
				transaction.amount,
				transaction.date,
				transaction.planData ? transaction.planData.plan : "",
			);
		}

		await transaction.save();

		res.json({
			message: `Contract ${status} successfully`,
			transaction: transaction,
		});
	} catch (error: any) {
		res.status(500).json({ message: error.message });
	}
});

// GET /api/plans/:id - Get plan by ID
router.get("/:id", async (req, res) => {
	try {
		const plan = await Plan.findById(req.params.id);
		if (!plan) {
			return res.status(404).json({ message: "Plan not found" });
		}
		res.json(plan);
	} catch (error) {
		console.error("Error fetching plan:", error);
		res.status(500).json({ message: "Failed to fetch plan" });
	}
});

// POST /api/plans - Create new plan (admin only)
router.post("/", async (req: Request, res: Response) => {
	try {
		const { name, description, roi, minAmount, duration, features } = req.body;

		const plan = new Plan({
			name,
			description,
			roi,
			minAmount,
			duration,
			features,
			isActive: true,
		});

		await plan.save();
		res.status(201).json(plan);
	} catch (error) {
		console.error("Error creating plan:", error);
		res.status(500).json({ message: "Failed to create plan" });
	}
});

// PUT /api/plans/:id - Update plan (admin only)
router.put("/:id", async (req: Request, res: Response) => {
	try {
		const { name, description, roi, minAmount, duration, features, isActive } = req.body;

		const plan = await Plan.findByIdAndUpdate(
			req.params.id,
			{ name, description, roi, minAmount, duration, features, isActive },
			{ new: true, runValidators: true },
		);

		if (!plan) {
			return res.status(404).json({ message: "Plan not found" });
		}

		res.json(plan);
	} catch (error) {
		console.error("Error updating plan:", error);
		res.status(500).json({ message: "Failed to update plan" });
	}
});

// DELETE /api/plans/:id - Delete plan (admin only)
router.delete("/:id", async (req: Request, res: Response) => {
	try {
		const plan = await Plan.findByIdAndDelete(req.params.id);
		if (!plan) {
			return res.status(404).json({ message: "Plan not found" });
		}
		res.json({ message: "Plan deleted successfully" });
	} catch (error) {
		console.error("Error deleting plan:", error);
		res.status(500).json({ message: "Failed to delete plan" });
	}
});

export default router;
