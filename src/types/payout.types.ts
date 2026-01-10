export interface PayoutProvider {
  id: string;
  name: string;
  type: 'nowpayments' | 'manual';
  enabled: boolean;
  priority: number; // Lower number = higher priority
}

export interface PayoutRequest {
  userId: string;
  amount: number;
  currency: string;
  walletAddress: string;
  extraId?: string; // For currencies like XRP, EOS that need memo/tag
  requestedAt: Date;
  processedAt?: Date;
  status: PayoutStatus;
  provider?: PayoutProvider['type'];
  providerId?: string; // External provider's transaction ID
  txHash?: string;
  notes?: string;
  adminNotes?: string;
  ipnCallbackUrl?: string;
}

export enum PayoutStatus {
  PENDING = 'pending',           // Waiting for processing
  PROCESSING = 'processing',     // Being processed by provider
  COMPLETED = 'completed',       // Successfully completed
  FAILED = 'failed',            // Failed to process
  CANCELLED = 'cancelled',      // Cancelled by admin/user
  REQUIRES_MANUAL = 'requires_manual' // Needs manual intervention
}

export interface PayoutAttempt {
  payoutRequestId: string;
  provider: PayoutProvider['type'];
  attemptedAt: Date;
  status: PayoutStatus;
  errorMessage?: string;
  providerId?: string;
  txHash?: string;
  cost?: number; // Provider fee
}

export interface UserWallet {
  userId: string;
  currency: string;
  address: string;
  extraId?: string;
  label?: string;
  isVerified: boolean;
  verifiedAt?: Date;
  addedAt: Date;
  lastUsedAt?: Date;
}

export interface PayoutBalance {
  currency: string;
  availableAmount: number;
  pendingAmount: number;
  reservedAmount: number;
  lastUpdated: Date;
}

export interface PayoutSettings {
  minimumAmount: { [currency: string]: number };
  maximumAmount: { [currency: string]: number };
  dailyLimit: { [currency: string]: number };
  enabledCurrencies: string[];
  autoApprovalLimit: { [currency: string]: number };
  requiresManualApproval: boolean;
  enabledProviders: PayoutProvider['type'][];
}

export interface MassPayoutRequest {
  batchId: string;
  payoutRequests: string[]; // Array of payout request IDs
  createdAt: Date;
  processedAt?: Date;
  status: PayoutStatus;
  provider: PayoutProvider['type'];
  providerId?: string;
  totalAmount: number;
  currency: string;
  successCount: number;
  failureCount: number;
}

// API Response types
export interface CreatePayoutResponse {
  success: boolean;
  payoutRequestId?: string;
  providerId?: string;
  status: PayoutStatus;
  message: string;
  estimatedCompletion?: Date;
}

export interface PayoutStatusResponse {
  payoutRequestId: string;
  status: PayoutStatus;
  provider?: PayoutProvider['type'];
  providerId?: string;
  txHash?: string;
  amount: number;
  currency: string;
  walletAddress: string;
  createdAt: Date;
  processedAt?: Date;
  errorMessage?: string;
}

export interface PayoutListResponse {
  payouts: PayoutStatusResponse[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

// Webhook payload types
export interface PayoutWebhookPayload {
  type: 'payout_status_update';
  payoutRequestId: string;
  providerId?: string;
  status: PayoutStatus;
  txHash?: string;
  errorMessage?: string;
  timestamp: Date;
}

export interface ProviderPayoutResponse {
  success: boolean;
  providerId: string;
  status: PayoutStatus;
  txHash?: string;
  errorMessage?: string;
  estimatedCompletion?: Date;
  fee?: number;
}

export interface ProviderBalanceResponse {
  currency: string;
  available: number;
  pending: number;
  total: number;
}

export interface ProviderCapabilities {
  supportedCurrencies: string[];
  minimumAmounts: { [currency: string]: number };
  maximumAmounts: { [currency: string]: number };
  estimatedProcessingTime: { [currency: string]: number }; // in minutes
  fees: { [currency: string]: number }; // percentage or fixed amount
  supportsMassPayouts: boolean;
  supportsInstantPayouts: boolean;
  requiresAddressValidation: boolean;
}

export interface PayoutValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  estimatedFee?: number;
  estimatedCompletion?: Date;
}

export interface PayoutStatistics {
  totalVolume: { [currency: string]: number };
  totalCount: number;
  successRate: number;
  averageProcessingTime: number; // in minutes
  providerStats: {
    [provider in PayoutProvider['type']]: {
      volume: { [currency: string]: number };
      count: number;
      successRate: number;
      averageProcessingTime: number;
    };
  };
  timeRange: {
    start: Date;
    end: Date;
  };
}