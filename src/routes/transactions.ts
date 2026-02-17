import express from "express";
import { Transaction } from "../models/transaction";
import { requireAuth, requireAdmin, AuthRequest } from "../middleware/auth";

const router = express.Router();

// getting all deposits
router.get("/deposits", requireAuth, requireAdmin, async (req, res) => {
	try {
		const deposits = await Transaction.find({ type: "deposit" });
		res.send(deposits);
	} catch (e) {
		res.status(500).json({ message: "Failed to fetch deposits" });
	}
});

// getting all withdrawals
router.get("/withdrawals", requireAuth, requireAdmin, async (req, res) => {
	try {
		const withdrawals = await Transaction.find({ type: "withdrawal" });
		res.send(withdrawals);
	} catch (e) {
		res.status(500).json({ message: "Failed to fetch withdrawals" });
	}
});

// getting all contracts
router.get("/contracts", requireAuth, requireAdmin, async (req, res) => {
	try {
		// Support both old and new transaction types for backward compatibility
		const contracts = await Transaction.find({ 
			type: { $in: ["contract", "investment", "gold_investment"] } 
		});
		res.send(contracts);
	} catch (e) {
		res.status(500).json({ message: "Failed to fetch contracts" });
	}
});

// getting single transaction
router.get("/:id", requireAuth, async (req: AuthRequest, res) => {
	const { id } = req.params;

	try {
		const transaction = await Transaction.findById(id);

		if (!transaction) return res.status(400).send({ message: "Transaction not found..." });
		if (!req.user?.isAdmin) {
			const txnEmail = String((transaction as any)?.user?.email || "").toLowerCase();
			if (!txnEmail || txnEmail !== String(req.user?.email || "").toLowerCase()) {
				return res.status(403).json({ message: "Access denied" });
			}
		}
		res.send(transaction);
	} catch (e) {
		res.status(500).json({ message: "Failed to fetch transactions" });
	}
});

// getting all transactions
router.get("/", requireAuth, async (req: AuthRequest, res) => {
	try {
		const filter = req.user?.isAdmin ? {} : { "user.email": req.user?.email };
		let transactions = await Transaction.find(filter);
		if (!transactions || transactions.length === 0) {
			return res.status(200).send([]);
		}

		transactions = transactions.flat();
		transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

		res.send(transactions);
	} catch (e) {
		res.status(500).json({ message: "Failed to fetch transactions" });
	}
});

// get all transactions by user
router.get("/user/:email", requireAuth, async (req: AuthRequest, res) => {
	const { email } = req.params;
	if (!req.user?.isAdmin && String(req.user?.email || "").toLowerCase() !== String(email).toLowerCase()) {
		return res.status(403).json({ message: "Access denied" });
	}

	try {
		let transactions = await Transaction.find({ "user.email": email });
		if (!transactions || transactions.length === 0) {
			return res.status(200).send([]);
		}

		transactions = transactions.flat();
		transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

		res.send(transactions);
	} catch (e) {
		res.status(500).json({ message: "Failed to fetch transactions" });
	}
});

// Update a single transaction by ID
router.put("/:id", requireAuth, requireAdmin, async (req, res) => {
	const { id } = req.params;
	const { amount, convertedAmount } = req.body;

	try {
		if (!amount || !convertedAmount) {
			return res.status(400).send({ message: "Both amount and convertedAmount are required." });
		}

		// Find the transaction by ID and update the fields
		const updatedTransaction = await Transaction.findByIdAndUpdate(
			id,
			{
				$set: {
					amount,
					"walletData.convertedAmount": convertedAmount,
				},
			},
			{ new: true },
		);

		// Check if the transaction was found and updated
		if (!updatedTransaction) return res.status(404).send({ message: "Transaction not found." });

		res.send({ message: "Transaction updated successfully." });
	} catch (error) {
		res.status(500).send({ message: "Something went wrong while updating the transaction." });
	}
});

// Delete a transaction
router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
	const { id } = req.params;

	try {
		let transaction = await Transaction.findByIdAndDelete(id);

		if (!transaction) return res.status(400).send({ message: "Transaction not found..." });
		res.send(transaction);
	} catch (e) {
		res.status(500).json({ message: "Failed to fetch transactions" });
	}
});

export default router;
