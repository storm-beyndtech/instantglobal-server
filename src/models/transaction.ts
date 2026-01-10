import mongoose from "mongoose";

// transaction schema
const transactionSchema = new mongoose.Schema(
	{
		type: {
			type: String,
			required: true,
			minLength: 5,
			maxLength: 20,
		},
		user: {
			id: {
				type: mongoose.Schema.Types.ObjectId,
			},
			email: {
				type: String,
			},
			name: {
				type: String,
			},
		},
		status: {
			type: String,
			default: "pending",
			minLength: 4,
			maxLength: 20,
		},
		currency: {
			type: String,
			default: "USD",
		},
		metadata: {
			type: mongoose.Schema.Types.Mixed,
			default: {},
		},
		amount: {
			type: Number,
			required: true,
			minLength: 10,
			maxLength: 20000000,
		},
		date: {
			type: Date,
			default: Date.now,
		},
		walletData: {
			address: {
				type: String,
				default: "",
			},
			network: {
				type: String,
				default: "",
			},
			coinName: {
				type: String,
				default: "",
			},
			convertedAmount: {
				type: Number,
				default: "",
			},
		},
		planData: {
			plan: {
				type: String,
				default: "",
			},
			duration: {
				type: String,
				default: "",
			},
			interest: {
				type: Number,
				default: 0,
			},
		},
		// NOWPayments automated payout fields
		payoutProvider: {
			type: String,
			enum: ['nowpayments', 'manual'],
			default: null,
		},
		nowPaymentsId: {
			type: String,
			default: null,
		},
		nowPaymentsTxHash: {
			type: String,
			default: null,
		},
		autoProcessed: {
			type: Boolean,
			default: false,
		},
		processedAt: {
			type: Date,
			default: null,
		},
		payoutError: {
			type: String,
			default: null,
		},
		payoutAttempts: {
			type: Number,
			default: 0,
		},
		lastAttemptAt: {
			type: Date,
			default: null,
		},
	},
	{
		timestamps: true,
	},
);

// Add indexes for better query performance
transactionSchema.index({ userId: 1, type: 1, status: 1 });
transactionSchema.index({ payoutProvider: 1, status: 1 });
transactionSchema.index({ nowPaymentsId: 1 }, { sparse: true });
transactionSchema.index({ date: -1 });
transactionSchema.index({ processedAt: -1 }, { sparse: true });

export const Transaction = mongoose.model("Transaction", transactionSchema);
