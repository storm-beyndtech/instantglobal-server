import express from "express";
import { Util } from "../models/util";
import { multiMails } from "../utils/mailer";

const router = express.Router();

// getting all utils
router.get("/", async (req, res) => {
	try {
		const utils = await Util.find();
		res.send(utils[0]);
	} catch (x) {
		return res.status(500).send("Something Went Wrong...");
	}
});

// updating a util
router.put("/update/:id", async (req, res) => {
	const { id } = req.params;

	try {
		const util = await Util.findByIdAndUpdate(
			id,
			{
				$set: req.body,
			},
			{
				new: true,
				runValidators: true,
			},
		);

		if (!util) return res.status(404).send("Util not found");

		res.status(200).send(util);
	} catch (error) {
		console.error("Utils endpoint error:", error);
		res.status(500).json({
			success: false,
			message: "Failed to load payment methods",
			coins: [],
		});
	}
});

// deleting a util
router.delete("/:id", async (req, res) => {
	const { id } = req.params;

	try {
		const util = await Util.findByIdAndDelete(id);
		if (!util) return res.status(404).send("Util not found");

		res.status(200).send(util);
	} catch (error) {
		console.error("Utils endpoint error:", error);
		res.status(500).json({
			success: false,
			message: "Failed to load payment methods",
			coins: [],
		});
	}
});

// POST route to send mail
router.post("/send-mail", async (req, res) => {
	const { emails, subject, message } = req.body;

	if (!emails || !Array.isArray(emails) || emails.length === 0) {
		return res.status(400).json({ message: "A valid array of emails is required" });
	}

	if (!subject || !message) {
		return res.status(400).json({ message: "Subject and message are required" });
	}

	try {
		const emailData = await multiMails(emails, subject, message);
		if (emailData.error) return res.status(400).send({ message: emailData.error });

		res.status(200).json({
			message: "Emails sent successfully",
		});
	} catch (error) {
		console.error("Error sending emails:", error);
		res.status(500).json({ message: "Failed to send emails", error });
	}
});

export default router;
