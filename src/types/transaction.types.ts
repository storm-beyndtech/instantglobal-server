// =============================================================================
// SERVER TRANSACTION TYPES
// =============================================================================

import mongoose from "mongoose";

export type TransactionType = 
  | "deposit" 
  | "withdrawal" 
  | "contract" 
  | "interest_payout" 
  | "bonus" 
  | "referral_bonus";

export type TransactionStatus = 
  | "pending" 
  | "approved" 
  | "rejected" 
  | "processing" 
  | "completed" 
  | "failed";

// Wallet Data for crypto transactions
export interface WalletData {
  address: string;
  network: string;
  coinName: string;
  convertedAmount: number;
}

// Plan Data for contract transactions
export interface PlanData {
  plan: string;
  duration: string;
  interest: number;
}

// Gold Contract Data for gold contract transactions
export interface GoldContractData {
  planId: mongoose.Types.ObjectId;
  goldOunces: number;
  dailyReturn: number;
  startDate: Date;
  endDate: Date;
  duration: number; // in days
}


// Transaction Interface (for database)
export interface ITransaction {
  _id: string;
  type: TransactionType;
  userId: mongoose.Types.ObjectId;
  status: TransactionStatus;
  amount: number;
  date: Date;
  walletData?: WalletData;
  planData?: PlanData;
  goldContractData?: GoldContractData;
  transactionNumber: string;
  // NOWPayments integration fields
  nowPaymentsId?: string;
  nowPaymentsTxHash?: string;
  autoProcessed?: boolean;
  payoutError?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Transaction Creation Request
export interface CreateTransactionRequest {
  type: TransactionType;
  userId: string;
  amount: number;
  walletData?: Partial<WalletData>;
  planData?: Partial<PlanData>;
  goldContractData?: Partial<GoldContractData>;
}

// Transaction Query Parameters
export interface TransactionQuery {
  userId?: string;
  type?: TransactionType;
  status?: TransactionStatus;
  startDate?: Date;
  endDate?: Date;
  minAmount?: number;
  maxAmount?: number;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// Transaction Response with User Population
export interface ITransactionWithUser extends Omit<ITransaction, 'userId'> {
  userId: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
    username: string;
  };
}