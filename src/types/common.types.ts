// =============================================================================
// SERVER COMMON TYPES
// =============================================================================

// Team Member Interface (for database)
export interface ITeamMember {
  _id: string;
  name: string;
  position: string;
  department: string;
  email?: string;
  phone?: string;
  bio: string;
  image?: string;
  linkedIn?: string;
  twitter?: string;
  expertise: string[];
  yearsExperience: number;
  isActive: boolean;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

// Market Rate Interface (for database)
export interface IMarketRate {
  _id: string;
  rateName: string;
  displayName: string;
  currentRate: number;
  previousRate?: number;
  change?: number;
  changePercent?: number;
  lastUpdated: Date;
  source: string;
  description?: string;
  category: string;
  order: number;
  isActive: boolean;
  historicalData: Array<{
    date: Date;
    rate: number;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

// Pagination and Query Types
export interface PaginationQuery {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// API Response Wrapper
export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  errors?: Record<string, string[]>;
  code?: string;
}