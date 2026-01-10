import mongoose from "mongoose";
import { User } from "../models/user";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

async function checkUsers() {
	try {
		// Connect to MongoDB
		const mongoUri = process.env.MONGODB_URI;
		if (!mongoUri) {
			throw new Error("MONGODB_URI not found in environment variables");
		}

		await mongoose.connect(mongoUri);
		console.log("✅ Connected to MongoDB");

		// Count total users
		const totalUsers = await User.countDocuments();
		console.log(`\n📊 Total users in database: ${totalUsers}`);

		// Count admin users
		const adminUsers = await User.countDocuments({ isAdmin: true });
		console.log(`👑 Admin users: ${adminUsers}`);

		// Count regular users
		const regularUsers = await User.countDocuments({ isAdmin: false });
		console.log(`👤 Regular users: ${regularUsers}`);

		// List all users (limited to 10 for safety)
		const users = await User.find({})
			.select("email username firstName lastName isAdmin role accountStatus kycStatus createdAt")
			.limit(10)
			.sort({ createdAt: -1 });

		console.log("\n📋 Recent Users (max 10):");
		console.log("─────────────────────────────────────────────────────────────");
		users.forEach((user, index) => {
			console.log(`${index + 1}. ${user.email}`);
			console.log(`   Name: ${user.firstName} ${user.lastName}`);
			console.log(`   Username: ${user.username}`);
			console.log(`   Role: ${user.role} (isAdmin: ${user.isAdmin})`);
			console.log(`   Account Status: ${user.accountStatus}`);
			console.log(`   KYC Status: ${user.kycStatus}`);
			console.log(`   Created: ${user.createdAt}`);
			console.log("─────────────────────────────────────────────────────────────");
		});

		await mongoose.connection.close();
		console.log("\n✅ Database connection closed");
	} catch (error) {
		console.error("❌ Error checking users:", error);
		process.exit(1);
	}
}

// Run the script
checkUsers();
