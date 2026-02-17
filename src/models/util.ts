import mongoose from "mongoose";

interface ICoin {
  name: string;
  address: string;
  network: string;
  price: number;
}

interface IBankDetails {
  bankName: string;
  accountName: string;
  accountNumber: string;
  routingNumber: string;
  swift: string;
  iban: string;
  bankAddress: string;
}

export interface IUtil extends mongoose.Document {
  coins: ICoin[];
  bankDetails: IBankDetails;
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
  bankDetails: {
    bankName: { type: String, default: "" },
    accountName: { type: String, default: "" },
    accountNumber: { type: String, default: "" },
    routingNumber: { type: String, default: "" },
    swift: { type: String, default: "" },
    iban: { type: String, default: "" },
    bankAddress: { type: String, default: "" },
  },
}, {
  timestamps: true
});

// Add indexes for better query performance
utilSchema.index({ "coins.name": 1 });
utilSchema.index({ "coins.network": 1 });

// util model
export const Util = mongoose.model<IUtil>("Util", utilSchema);
