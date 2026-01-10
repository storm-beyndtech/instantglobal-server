import mongoose, { Document, Schema } from 'mongoose';

export interface IMarketRate extends Document {
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

const marketRateSchema = new Schema<IMarketRate>({
  rateName: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  displayName: {
    type: String,
    required: true,
    trim: true,
  },
  currentRate: {
    type: Number,
    required: true,
  },
  previousRate: {
    type: Number,
  },
  change: {
    type: Number,
  },
  changePercent: {
    type: Number,
  },
  lastUpdated: {
    type: Date,
    default: Date.now,
  },
  source: {
    type: String,
    required: true,
    default: 'TheFinancials.com',
  },
  description: {
    type: String,
  },
  category: {
    type: String,
    required: true,
    enum: ['Treasury', 'SOFR', 'Prime', 'Other'],
  },
  order: {
    type: Number,
    default: 0,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  historicalData: [{
    date: {
      type: Date,
      required: true,
    },
    rate: {
      type: Number,
      required: true,
    },
  }],
}, {
  timestamps: true,
});

marketRateSchema.index({ category: 1, order: 1 });
marketRateSchema.index({ isActive: 1 });
marketRateSchema.index({ lastUpdated: -1 });

export default mongoose.model<IMarketRate>('MarketRate', marketRateSchema);