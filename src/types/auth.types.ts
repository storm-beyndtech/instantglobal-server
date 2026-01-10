import { z } from 'zod';
import mongoose, { Document } from 'mongoose';

// =============================================================================
// BASE ENUMS AND CONSTANTS
// =============================================================================

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin'
}

export enum KYCStatus {
  PENDING = 'pending',
  APPROVED = 'approved', 
  REJECTED = 'rejected',
  INCOMPLETE = 'incomplete',
  EXPIRED = 'expired'
}

export enum AccountStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  DEACTIVATED = 'deactivated',
  PENDING_VERIFICATION = 'pending_verification'
}

export enum ContractProductType {
  FINE_GOLDBAR_CUSTOMER_BASIC = 'fine_goldbar_customer_basic',
  FINE_GOLDBAR_SALES_PREMIUM = 'fine_goldbar_sales_premium',
  PREMIUM_BENEFIT = 'premium_benefit'
}

export enum DeliveryPeriod {
  MONTH_36 = '36M',
  MONTH_24 = '24M', 
  MONTH_12 = '12M'
}

// =============================================================================
// ZOD VALIDATION SCHEMAS
// =============================================================================

// Personal Information Schema (Step 2: My Data)
export const PersonalInfoSchema = z.object({
  sponsorCode: z.string().optional(),
  title: z.enum(['Mr', 'Mrs', 'Ms', 'Dr', 'Prof']),
  firstName: z.string().min(2, 'First name must be at least 2 characters'),
  lastName: z.string().min(2, 'Last name must be at least 2 characters'),
  birthday: z.object({
    day: z.number().min(1).max(31),
    month: z.number().min(1).max(12),
    year: z.number().min(1900).max(new Date().getFullYear() - 18)
  }),
  email: z.string().email('Invalid email address'),
  address: z.string().min(5, 'Address must be at least 5 characters'),
  zipCode: z.string().min(3, 'ZIP code is required'),
  location: z.string().min(2, 'Location is required'),
  country: z.string().min(2, 'Country is required'),
  mobileNumber: z.object({
    countryCode: z.string().regex(/^\+\d{1,4}$/, 'Invalid country code'),
    number: z.string().regex(/^\d{5,15}$/, 'Invalid phone number')
  })
});

// Contract Product Schema
export const ContractProductSchema = z.object({
  product: z.nativeEnum(ContractProductType),
  weight: z.string(),
  price: z.number().positive('Price must be positive'),
  quantity: z.number().int().positive('Quantity must be positive'),
  deliveryPeriod: z.nativeEnum(DeliveryPeriod),
  percentage: z.number().min(0).max(100).optional(),
  amount: z.number().positive('Amount must be positive'),
  totalSum: z.number().positive('Total sum must be positive')
});

// Portfolio Schema (Step 3: Goldkauf)
export const PortfolioSchema = z.object({
  products: z.array(ContractProductSchema).min(1, 'At least one product is required'),
  tempSum: z.number().positive('Temporary sum must be positive'),
  finalSum: z.number().positive('Final sum must be positive'),
  minimumOrderAmount: z.number().default(100),
  premiumBenefit: z.object({
    amount: z.number().optional(),
    quantity: z.number().optional()
  }).optional()
});

// KYC/AML Schema (Step 5: Checkout/Payment)
export const KYCSchema = z.object({
  buyingForSelf: z.boolean(),
  politicallyExposed: z.boolean(),
  termsAndConditions: z.boolean().refine(val => val === true, 'Terms and conditions must be accepted'),
  privacyStatement: z.boolean().refine(val => val === true, 'Privacy statement must be accepted'),
  paymentMethod: z.enum(['bank_transfer', 'credit_card', 'paypal']).default('bank_transfer'),
  bankDetails: z.object({
    accountHolder: z.string().optional(),
    bankName: z.string().optional(),
    iban: z.string().optional(),
    bic: z.string().optional()
  }).optional()
});

// Registration Request Schema (Complete form)
export const RegistrationSchema = z.object({
  personalInfo: PersonalInfoSchema,
  portfolio: PortfolioSchema,
  kyc: KYCSchema,
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, 
           'Password must contain uppercase, lowercase, number and special character'),
  confirmPassword: z.string()
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"]
});

// Login Schema
export const LoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional()
});

// Admin User Creation Schema
export const AdminCreateUserSchema = z.object({
  personalInfo: PersonalInfoSchema,
  role: z.nativeEnum(UserRole).default(UserRole.USER),
  accountStatus: z.nativeEnum(AccountStatus).default(AccountStatus.PENDING_VERIFICATION),
  kycStatus: z.nativeEnum(KYCStatus).default(KYCStatus.PENDING),
  isEmailVerified: z.boolean().default(false),
  password: z.string().min(8, 'Password must be at least 8 characters')
});

// Profile Update Schema
export const ProfileUpdateSchema = z.object({
  firstName: z.string().min(2).optional(),
  lastName: z.string().min(2).optional(),
  address: z.string().min(5).optional(),
  zipCode: z.string().min(3).optional(),
  location: z.string().min(2).optional(),
  country: z.string().min(2).optional(),
  mobileNumber: z.object({
    countryCode: z.string().regex(/^\+\d{1,4}$/),
    number: z.string().regex(/^\d{5,15}$/)
  }).optional()
});

// Password Change Schema
export const PasswordChangeSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, 
           'Password must contain uppercase, lowercase, number and special character'),
  confirmPassword: z.string()
}).refine(data => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"]
});

// =============================================================================
// TYPESCRIPT TYPES (derived from Zod schemas)
// =============================================================================

export type PersonalInfo = z.infer<typeof PersonalInfoSchema>;
export type ContractProduct = z.infer<typeof ContractProductSchema>;
export type Portfolio = z.infer<typeof PortfolioSchema>;
export type KYCData = z.infer<typeof KYCSchema>;
export type RegistrationRequest = z.infer<typeof RegistrationSchema>;
export type LoginRequest = z.infer<typeof LoginSchema>;
export type AdminCreateUserRequest = z.infer<typeof AdminCreateUserSchema>;
export type ProfileUpdateRequest = z.infer<typeof ProfileUpdateSchema>;
export type PasswordChangeRequest = z.infer<typeof PasswordChangeSchema>;

// Database User Interface
export interface IUser {
  _id: string;
  personalInfo: PersonalInfo;
  portfolio?: Portfolio;
  kyc?: KYCData;
  role: UserRole;
  accountStatus: AccountStatus;
  kycStatus: KYCStatus;
  isEmailVerified: boolean;
  passwordHash: string;
  emailVerificationToken?: string;
  emailVerificationExpires?: Date;
  passwordResetToken?: string;
  passwordResetExpires?: Date;
  lastLogin?: Date;
  loginAttempts: number;
  lockUntil?: Date;
  twoFactorSecret?: string;
  twoFactorEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  // Virtual properties
  fullName: string;
  isLocked: boolean;
  age: number;
  // Methods
  comparePassword(password: string): Promise<boolean>;
  incrementLoginAttempts(): Promise<any>;
  resetLoginAttempts(): Promise<any>;
  toSafeObject(): Omit<IUser, 'passwordHash' | 'emailVerificationToken' | 'passwordResetToken' | 'twoFactorSecret'>;
}

// User Model Interface (for static methods)
export interface IUserModel extends mongoose.Model<IUser & Document> {
  findByEmail(email: string): Promise<IUser | null>;
  findByEmailWithPassword(email: string): Promise<IUser | null>;
  hashPassword(password: string): Promise<string>;
  generateSponsorCode(): string;
}

// JWT Payload Interface
export interface IJWTPayload {
  userId: string;
  email: string;
  role: UserRole;
  kycStatus: KYCStatus;
  accountStatus: AccountStatus;
  iat?: number;
  exp?: number;
}

// API Response Interfaces
export interface IAuthResponse {
  success: boolean;
  message: string;
  user?: Omit<IUser, 'passwordHash' | 'emailVerificationToken' | 'passwordResetToken'>;
  token?: string;
  refreshToken?: string;
}

export interface IErrorResponse {
  success: false;
  message: string;
  errors?: Record<string, string[]>;
  code?: string;
}

// =============================================================================
// REQUEST/RESPONSE INTERFACES
// =============================================================================

export interface AuthenticatedRequest extends Request {
  user?: IUser;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface UserListQuery extends PaginationQuery {
  role?: UserRole;
  accountStatus?: AccountStatus;
  kycStatus?: KYCStatus;
  search?: string;
}


export default {
  UserRole,
  KYCStatus, 
  AccountStatus,
  ContractProductType,
  DeliveryPeriod
};