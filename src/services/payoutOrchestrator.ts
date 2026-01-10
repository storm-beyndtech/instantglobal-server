import NOWPaymentsService from "./nowPaymentsService";
import { Transaction } from "../models/transaction";

interface CreatePayoutResponse {
	success: boolean;
	transactionId?: string;
	providerId?: string;
	status: string;
	message: string;
	txHash?: string;
}

interface PayoutValidationResult {
	valid: boolean;
	errors: string[];
	warnings: string[];
}

export class PayoutOrchestrator {
	private nowPayments: NOWPaymentsService;

	constructor() {
		this.nowPayments = new NOWPaymentsService();
		console.log("✅ Payout Orchestrator initialized with NOWPayments");
	}

	/**
	 * Test NOWPayments connection
	 */
	async testConnection(): Promise<{ connected: boolean; message: string; details?: string }> {
		try {
			const result = await this.nowPayments.testConnection();
			return result;
		} catch (error: any) {
			return {
				connected: false,
				message: `NOWPayments test failed: ${error.message}`,
				details: "Check your API credentials and network connection",
			};
		}
	}

	/**
	 * Check if NOWPayments can handle the payout
	 */
	private async canProcessPayout(currency: string, amount: number): Promise<boolean> {
		try {
			const connection = await this.nowPayments.testConnection();
			if (!connection.connected) {
				return false;
			}

			const balances = await this.nowPayments.getBalance(currency);
			const balance = balances.find((b) => b.currency.toLowerCase() === currency.toLowerCase());
			return balance ? balance.available_amount >= amount : false;
		} catch (error) {
			console.warn("Error checking NOWPayments availability:", error);
			return false;
		}
	}

	/**
	 * Validate a payout request
	 */
	async validatePayout(
		amount: number,
		currency: string,
		walletAddress: string,
	): Promise<PayoutValidationResult> {
		const errors: string[] = [];
		const warnings: string[] = [];

		// Basic validation
		if (amount <= 0) {
			errors.push("Amount must be positive");
		}

		if (!walletAddress || walletAddress.length < 10) {
			errors.push("Invalid wallet address");
		}

		if (!currency || currency.length < 2) {
			errors.push("Invalid currency");
		}

		// Check minimum amounts
		try {
			if (currency) {
				const minAmount = await this.nowPayments.getMinimumPayout(currency);
				if (amount < minAmount) {
					errors.push(`Amount below minimum: ${minAmount} ${currency}`);
				}
			}
		} catch (error) {
			warnings.push("Could not verify minimum amount requirements");
		}

		// Validate address format
		try {
			const nowValidation = await this.nowPayments.validateAddress(walletAddress, currency);
			if (!nowValidation.valid) {
				errors.push(`Invalid address: ${nowValidation.message}`);
			}
		} catch (error) {
			warnings.push("Could not validate address format");
		}

		return {
			valid: errors.length === 0,
			errors,
			warnings,
		};
	}

	/**
	 * Process an existing withdrawal transaction using NOWPayments
	 */
	async processWithdrawal(transactionId: string): Promise<CreatePayoutResponse> {
		try {
			// Get the transaction
			const transaction = await Transaction.findById(transactionId);
			if (!transaction) {
				return {
					success: false,
					status: "failed",
					message: "Transaction not found",
				};
			}

			// Only process withdrawal transactions that are pending
			if (transaction.type !== "withdrawal" || transaction.status !== "pending") {
				return {
					success: false,
					status: transaction.status,
					message: `Transaction is not a pending withdrawal (type: ${transaction.type}, status: ${transaction.status})`,
				};
			}

			// Extract withdrawal details
			const amount = transaction.amount;
			const currency = transaction.walletData?.coinName || "";
			const walletAddress = transaction.walletData?.address || "";
			const network = transaction.walletData?.network || "";

			// Validate that required wallet data exists
			if (!currency || !walletAddress) {
				transaction.status = "failed";
				transaction.payoutError = "Missing wallet data (currency or address)";
				await transaction.save();

				return {
					success: false,
					status: "failed",
					message: "Missing wallet data (currency or address)",
				};
			}

			// Validate the withdrawal
			const validation = await this.validatePayout(amount, currency, walletAddress);
			if (!validation.valid) {
				// Update transaction with validation errors
				transaction.status = "failed";
				transaction.payoutError = `Validation failed: ${validation.errors.join(", ")}`;
				await transaction.save();

				return {
					success: false,
					status: "failed",
					message: `Validation failed: ${validation.errors.join(", ")}`,
				};
			}

			// Check if NOWPayments can handle this payout
			const canProcess = await this.canProcessPayout(currency, amount);

			if (!canProcess) {
				// Mark for manual processing
				transaction.payoutProvider = "manual";
				transaction.status = "requires_manual";
				transaction.payoutError = "NOWPayments unavailable or insufficient balance";
				await transaction.save();

				return {
					success: true,
					status: "requires_manual",
					message: "NOWPayments unavailable - marked for manual processing",
					transactionId: transactionId,
				};
			}

			// Update transaction to processing
			transaction.status = "processing";
			transaction.payoutProvider = "nowpayments";
			transaction.payoutAttempts = (transaction.payoutAttempts || 0) + 1;
			transaction.lastAttemptAt = new Date();
			await transaction.save();

			// Process with NOWPayments
			const nowResult = await this.nowPayments.createPayout({
				address: walletAddress,
				currency: currency,
				amount: amount,
				extra_id: network === "XRP" || network === "EOS" ? network : undefined,
				ipn_callback_url: `${process.env.API_URL}/api/webhooks/nowpayments/payout`,
			});

			transaction.nowPaymentsId = nowResult.id || "";
			transaction.nowPaymentsTxHash = nowResult.txid || "";
			transaction.status = this.mapNOWPaymentsStatus(nowResult.status);
			transaction.autoProcessed = true;

			// Set processing completion time if completed/failed
			if (transaction.status === "completed" || transaction.status === "failed") {
				transaction.processedAt = new Date();
			}

			await transaction.save();

			return {
				success: true,
				status: transaction.status,
				message: "Withdrawal processed successfully via NOWPayments",
				transactionId: transactionId,
				providerId: nowResult.id,
				txHash: nowResult.txid,
			};
		} catch (error: any) {
			console.error("Error processing withdrawal:", error);

			// Update transaction status
			try {
				await Transaction.findByIdAndUpdate(transactionId, {
					status: "failed",
					payoutError: `Processing error: ${error.message}`,
				});
			} catch (updateError) {
				console.error("Error updating failed withdrawal:", updateError);
			}

			return {
				success: false,
				status: "failed",
				message: `Processing error: ${error.message}`,
			};
		}
	}

	/**
	 * Process multiple withdrawals at once (mass payout)
	 */
	async processMassWithdrawals(transactionIds: string[]): Promise<CreatePayoutResponse> {
		try {
			if (!transactionIds.length) {
				return {
					success: false,
					status: "failed",
					message: "No transaction IDs provided",
				};
			}

			// Get all pending withdrawal transactions
			const transactions = await Transaction.find({
				_id: { $in: transactionIds },
				type: "withdrawal",
				status: "pending",
			});

			if (transactions.length !== transactionIds.length) {
				return {
					success: false,
					status: "failed",
					message: "Some transactions not found or not in pending status",
				};
			}

			// Group by currency for efficient processing
			const groupedByCurrency = transactions.reduce((acc, tx) => {
				const currency = tx.walletData?.coinName || "";
				if (!acc[currency]) {
					acc[currency] = [];
				}
				acc[currency].push(tx);
				return acc;
			}, {} as { [currency: string]: typeof transactions });

			let totalProcessed = 0;
			let totalFailed = 0;

			// Process each currency group
			for (const [currency, txs] of Object.entries(groupedByCurrency)) {
				try {
					// Create mass payout data
					const massPayoutData = txs.map((tx) => ({
						address: tx.walletData?.address || "",
						currency: currency,
						amount: tx.amount,
						extra_id:
							tx.walletData?.network === "XRP" || tx.walletData?.network === "EOS"
								? tx.walletData.network
								: undefined,
					}));

					const massResult = await this.nowPayments.createMassPayout(massPayoutData);

					// Update individual transactions
					for (let i = 0; i < txs.length; i++) {
						const tx = txs[i];
						const withdrawal = massResult.withdrawals[i];

						tx.payoutProvider = "nowpayments";
						tx.nowPaymentsId = withdrawal.id || "";
						tx.nowPaymentsTxHash = withdrawal.txid || "";
						tx.status = this.mapNOWPaymentsStatus(withdrawal.status);
						tx.autoProcessed = true;
						tx.payoutAttempts = (tx.payoutAttempts || 0) + 1;
						tx.lastAttemptAt = new Date();

						if (tx.status === "completed" || tx.status === "failed") {
							tx.processedAt = new Date();
						}

						await tx.save();

						if (tx.status === "completed" || tx.status === "processing") {
							totalProcessed++;
						} else {
							totalFailed++;
						}
					}
				} catch (error: any) {
					console.error(`Error processing mass payout for ${currency}:`, error);

					// Mark all transactions in this group as failed
					for (const tx of txs) {
						tx.status = "failed";
						tx.payoutError = `Mass payout failed: ${error.message}`;
						await tx.save();
						totalFailed++;
					}
				}
			}

			return {
				success: totalProcessed > 0,
				status: totalFailed === 0 ? "completed" : "partial",
				message: `Mass withdrawal processed: ${totalProcessed} successful, ${totalFailed} failed`,
			};
		} catch (error: any) {
			console.error("Error creating mass withdrawal:", error);
			return {
				success: false,
				status: "failed",
				message: `Mass withdrawal creation failed: ${error.message}`,
			};
		}
	}

	/**
	 * Get withdrawal transaction status
	 */
	async getWithdrawalStatus(transactionId: string) {
		try {
			const transaction = await Transaction.findById(transactionId);
			if (!transaction) {
				return null;
			}

			return {
				transactionId: transaction._id.toString(),
				status: transaction.status,
				provider: transaction.payoutProvider,
				providerId: transaction.nowPaymentsId,
				txHash: transaction.nowPaymentsTxHash,
				amount: transaction.amount,
				currency: transaction.walletData?.coinName || "",
				walletAddress: transaction.walletData?.address || "",
				createdAt: transaction.date,
				processedAt: transaction.processedAt,
				errorMessage: transaction.payoutError,
				attempts: transaction.payoutAttempts || 0,
				autoProcessed: transaction.autoProcessed || false,
			};
		} catch (error: any) {
			console.error("Error getting withdrawal status:", error);
			return null;
		}
	}

	/**
	 * Get NOWPayments account balance
	 */
	async getBalance(currency?: string): Promise<any[]> {
		try {
			return await this.nowPayments.getBalance(currency);
		} catch (error: any) {
			console.error("Error getting balance:", error);
			return [];
		}
	}

	/**
	 * Get supported currencies
	 */
	async getSupportedCurrencies() {
		try {
			return await this.nowPayments.getAvailableCurrencies();
		} catch (error: any) {
			console.error("Error getting supported currencies:", error);
			return [];
		}
	}

	// Helper method
	private mapNOWPaymentsStatus(status: string): string {
		switch (status.toLowerCase()) {
			case "waiting":
			case "confirming":
				return "processing";
			case "confirmed":
			case "finished":
				return "completed";
			case "failed":
			case "refunded":
				return "failed";
			default:
				return "pending";
		}
	}
}

export default PayoutOrchestrator;
