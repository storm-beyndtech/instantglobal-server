import mongoose from "mongoose";

interface ICoin {
  name: string;
  address: string;
  network: string;
  price: number;
}

export interface IUtil extends mongoose.Document {
  coins: ICoin[];
  createdAt: Date;
  updatedAt: Date;
}

// util schema
const utilSchema = new mongoose.Schema({
  coins: [
    {
      name: { type: String, required: true },
      address: { type: String, required: true },
      network: { type: String, required: true },
      price: { type: Number, required: true, min: 0 },
    },
  ],
}, {
  timestamps: true
});

// Add indexes for better query performance
utilSchema.index({ "coins.name": 1 });
utilSchema.index({ "coins.network": 1 });

// util model
export const Util = mongoose.model<IUtil>("Util", utilSchema);