import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { User } from "../models/user";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

async function createAdminAccount() {
	try {
		// Connect to MongoDB
		const mongoUri = process.env.MONGODB_URI;
		if (!mongoUri) {
			throw new Error("MONGODB_URI not found in environment variables");
		}

		await mongoose.connect(mongoUri);
		console.log("✅ Connected to MongoDB");

		// Admin account details
		const adminEmail = "admin@instantglobal.com";
		const adminPassword = "Admin@123456";
		const adminUsername = "admin";

		// Check if admin already exists
		const existingAdmin = await User.findOne({ email: adminEmail });
		if (existingAdmin) {
			console.log("⚠️  Admin account already exists:");
			console.log(`   Email: ${existingAdmin.email}`);
			console.log(`   Username: ${existingAdmin.username}`);
			console.log(`   IsAdmin: ${existingAdmin.isAdmin}`);
			console.log(`   Role: ${existingAdmin.role}`);
			await mongoose.connection.close();
			return;
		}

		// Hash password
		const salt = await bcrypt.genSalt(10);
		const hashedPassword = await bcrypt.hash(adminPassword, salt);

		// Generate account numbers
		const accountNumber = Math.floor(100000000 + Math.random() * 900000000).toString();
		const routingNumber = Math.floor(100000000 + Math.random() * 900000000).toString();

		// Create admin user
		const adminUser = new User({
			firstName: "Admin",
			lastName: "User",
			fullName: "Admin User",
			username: adminUsername,
			email: adminEmail,
			password: hashedPassword,
			phone: "+1-555-0100",
			dob: "1990-01-01",
			streetAddress: "123 Admin Street",
			city: "San Francisco",
			state: "CA",
			zipCode: "94102",
			country: "United States",
			accountNumber,
			routingNumber,
			wallets: [
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
			],
			deposit: 0,
			interest: 0,
			withdraw: 0,
			bonus: 0,
			role: "admin",
			isAdmin: true,
			kycStatus: "approved",
			accountStatus: "active",
			idVerified: true,
			isEmailVerified: true,
			mfa: false,
			profileImage: "",
			referral: {
				code: "",
				status: "none",
			},
		});

		await adminUser.save();

		console.log("\n✅ Admin account created successfully!");
		console.log("\n📧 Admin Credentials:");
		console.log(`   Email: ${adminEmail}`);
		console.log(`   Password: ${adminPassword}`);
		console.log(`   Username: ${adminUsername}`);
		console.log("\n🔐 Account Details:");
		console.log(`   Role: ${adminUser.role}`);
		console.log(`   IsAdmin: ${adminUser.isAdmin}`);
		console.log(`   Account Number: ${adminUser.accountNumber}`);
		console.log(`   Routing Number: ${adminUser.routingNumber}`);
		console.log(`   KYC Status: ${adminUser.kycStatus}`);
		console.log(`   Account Status: ${adminUser.accountStatus}`);
		console.log("\n⚠️  IMPORTANT: Change the password after first login!");

		await mongoose.connection.close();
		console.log("\n✅ Database connection closed");
	} catch (error) {
		console.error("❌ Error creating admin account:", error);
		process.exit(1);
	}
}

// Run the script
createAdminAccount();
