/**
 * Wallet Seeding Script
 *
 * This script adds default wallet slots to existing users who don't have them.
 * Run this script once after deploying the wallet seeding feature.
 *
 * Usage:
 * ts-node src/scripts/seedWallets.ts
 * or
 * npm run seed:wallets (add to package.json scripts)
 */

import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import { User } from "../models/user";

const defaultWallets = [
  {
    chain: "ETH",
    asset: "USDC",
    address: "",
    label: "Ethereum Deposit Address",
  },
  {
    chain: "TRX",
    asset: "USDT",
    address: "",
    label: "Tron Deposit Address",
  },
  {
    chain: "BSC",
    asset: "USDT",
    address: "",
    label: "BNB Chain Deposit Address",
  },
];

async function seedWallets() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error("MONGODB_URI not found in environment variables");
    }

    console.log("Connecting to MongoDB...");
    await mongoose.connect(mongoUri);
    console.log("Connected to MongoDB successfully!");

    // Find users without wallets or with old wallet structure
    console.log("\nSearching for users without default wallets...");

    const usersWithoutWallets = await User.find({
      $or: [
        { wallets: { $exists: false } },
        { wallets: { $size: 0 } },
        { wallets: { $not: { $elemMatch: { chain: "TRX" } } } }, // Missing TRX wallet (new)
      ],
    });

    console.log(`Found ${usersWithoutWallets.length} users to update\n`);

    if (usersWithoutWallets.length === 0) {
      console.log("✓ All users already have default wallets!");
      process.exit(0);
    }

    // Update users
    let successCount = 0;
    let errorCount = 0;

    for (const user of usersWithoutWallets) {
      try {
        // Check if user already has some wallets
        const existingWallets = user.wallets || [];

        // Add missing wallet types
        const existingChains = existingWallets.map((w: any) => w.chain);
        const walletsToAdd = defaultWallets.filter((w) => !existingChains.includes(w.chain));

        if (walletsToAdd.length > 0) {
          user.wallets = [...existingWallets, ...walletsToAdd];
          await user.save();

          console.log(`✓ Updated user: ${user.email} (added ${walletsToAdd.length} wallet slots)`);
          successCount++;
        }
      } catch (error: any) {
        console.error(`✗ Failed to update user ${user.email}:`, error.message);
        errorCount++;
      }
    }

    console.log("\n" + "=".repeat(50));
    console.log("Wallet Seeding Complete!");
    console.log("=".repeat(50));
    console.log(`✓ Successfully updated: ${successCount} users`);
    console.log(`✗ Failed: ${errorCount} users`);
    console.log("=".repeat(50) + "\n");

    // Disconnect
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB");

    process.exit(0);
  } catch (error: any) {
    console.error("\n❌ Error seeding wallets:", error);
    process.exit(1);
  }
}

// Run the script
seedWallets();
