// =============================================================================
// SERVER CONTRACT TYPES
// =============================================================================

export type ContractProductType =
  | "gold_bar"
  | "gold_coin"
  | "silver_bar"
  | "silver_coin"
  | "platinum"
  | "palladium";


export type DeliveryPeriod = "immediate" | "1_month" | "3_months" | "6_months";

// Contract Product Interface
export interface ContractProduct {
  product: ContractProductType;
  weight: string;
  price: number;
  quantity: number;
  deliveryPeriod: DeliveryPeriod;
  percentage?: number;
  amount: number;
  totalSum: number;
}


// Portfolio Interface
export interface Portfolio {
  products: ContractProduct[];
  tempSum: number;
  finalSum: number;
  minimumOrderAmount: number;
  premiumBenefit?: {
    amount?: number;
    quantity?: number;
  };
}

// Contract Plan Interface (for database)
export interface IContractPlan {
  _id: string;
  name: string;
  tier: string;
  description: string;
  minContract: number;
  maxContract: number;
  dailyReturn: number;
  planDuration: number;
  goldBacking: number;
  withdrawalLimit: number;
  features: string[];
  color: {
    primary: string;
    secondary: string;
    accent: string;
  };
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  
}


// KYC Data Interface
export interface KYCData {
  buyingForSelf: boolean;
  politicallyExposed: boolean;
  termsAndConditions: boolean;
  privacyStatement: boolean;
  paymentMethod: "bank_transfer" | "credit_card" | "paypal";
  bankDetails?: {
    accountHolder?: string;
    bankName?: string;
    iban?: string;
    bic?: string;
  };
}