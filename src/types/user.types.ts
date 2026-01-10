// =============================================================================
// SERVER USER TYPES
// =============================================================================

export type UserRole = "user" | "admin";
export type KYCStatus = "notSubmitted" | "unverified" | "pending" | "approved" | "rejected" | "incomplete" | "expired";
export type AccountStatus = "active" | "suspended" | "deactivated" | "pending_verification";

// Personal Information
export interface PersonalInfo {
  username: string;
  title: "Mr" | "Mrs" | "Ms" | "Dr" | "Prof";
  firstName: string;
  lastName: string;
  birthday: {
    day: number;
    month: number;
    year: number;
  };
  email: string;
  address: string;
  zipCode: string;
  location: string;
  state: string;
  country: string;
  mobileNumber: {
    countryCode: string;
    number: string;
  };
}

// Server User Interface (for database)
export interface IUser {
  _id: string;
  personalInfo: PersonalInfo;
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

// Authentication Request/Response Types
export interface LoginRequest {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface AuthResponse {
  success: boolean;
  message: string;
  user?: Omit<IUser, 'passwordHash' | 'emailVerificationToken' | 'passwordResetToken'>;
  token?: string;
  refreshToken?: string;
}

export interface ErrorResponse {
  success: false;
  message: string;
  errors?: Record<string, string[]>;
  code?: string;
}