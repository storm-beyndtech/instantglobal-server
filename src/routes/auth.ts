import express, { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { User } from "../models/user";
import { adminNewUserAlert } from "../utils/mailer";
import { v4 as uuidv4 } from "uuid";
import { validate, registerSchema, loginSchema } from "../middleware/validation";
import { registrationLimiter, loginLimiter } from "../middleware/rateLimiter";

const router = express.Router();

router.post("/register", registrationLimiter, validate(registerSchema), async (req: Request, res: Response) => {
	console.log("REGISTRATION ENDPOINT HIT!");

	try {
		let firstName, lastName, username, email, password, referralCode;
		let phone, dob, streetAddress, city, state, zipCode, country;

		if (req.body.personalInfo) {
			const { personalInfo } = req.body;
			firstName = personalInfo.firstName;
			lastName = personalInfo.lastName;
			email = personalInfo.email;
			username = personalInfo.username;
			password = req.body.password;
			referralCode = req.body.referralCode || "";

			streetAddress = personalInfo.address || "";
			city = personalInfo.location || "";
			state = personalInfo.state || "";
			zipCode = personalInfo.zipCode || "";
			country = personalInfo.country || "";

			if (personalInfo.mobileNumber?.countryCode && personalInfo.mobileNumber?.number) {
				phone = `${personalInfo.mobileNumber.countryCode}${personalInfo.mobileNumber.number}`;
			} else {
				phone = "";
			}

			if (personalInfo.birthday?.day && personalInfo.birthday?.month && personalInfo.birthday?.year) {
				dob = `${personalInfo.birthday.month}/${personalInfo.birthday.day}/${personalInfo.birthday.year}`;
			} else {
				dob = "";
			}
		} else {
			firstName = req.body.firstName;
			lastName = req.body.lastName;
			username = req.body.username;
			email = req.body.email;
			password = req.body.password;
			referralCode = req.body.referralCode || "";
			phone = req.body.phone || "";
			dob = req.body.dob || "";
			streetAddress = req.body.streetAddress || "";
			city = req.body.city || "";
			state = req.body.state || "";
			zipCode = req.body.zipCode || "";
			country = req.body.country || "";
		}

		if (!firstName || !lastName || !username || !email || !password) {
			return res.status(400).json({ message: "Missing required fields" });
		}

		const existingUser = await User.findOne({
			$or: [{ email }, { username }],
		});

		if (existingUser) {
			return res.status(400).json({ message: "User already exists" });
		}

		const hashedPassword = await bcrypt.hash(password, 12);
		const accountNumber = `62${String(Math.floor(Math.random() * 1_000_000_0000)).padStart(10, "0")}`;
		const routingNumber = "026009593";

		// Default wallet slots (admin fills actual addresses later)
		const wallets = [
			{ chain: "ETH", asset: "USDC", address: "", label: "Ethereum Deposit Address" },
			{ chain: "TRX", asset: "USDT", address: "", label: "Tron Deposit Address" },
			{ chain: "BSC", asset: "USDT", address: "", label: "BNB Chain Deposit Address" },
		];

		const newUser = new User({
			personalInfo: {
				firstName,
				lastName,
				email,
				username,
			},
			firstName,
			lastName,
			fullName: `${firstName} ${lastName}`,
			username,
			email,
			phone,
			dob,
			streetAddress,
			city,
			state,
			zipCode,
			country,
			password: hashedPassword,
			accountNumber,
			routingNumber,
			wallets,
			deposit: 0,
			interest: 0,
			withdraw: 0,
			bonus: 0,
			profileImage: "",
			referral: {
				code: referralCode || "",
				status: referralCode ? "pending" : "none",
			},
			role: "user",
			kycStatus: "notSubmitted",
			accountStatus: "active",
			isAdmin: false,
			mfa: false,
			idVerified: false,
			isEmailVerified: false,
		});

		await newUser.save();
		console.log(`User successfully saved to database: ${email} (username: ${username})`);

		// Send admin alert for new user registration
		try {
			await adminNewUserAlert(
				newUser.email,
				newUser.fullName,
				newUser.username,
				new Date()
			);
		} catch (emailError) {
			console.error("Failed to send admin alert email:", emailError);
			// Continue with registration even if email fails
		}

		// SECURITY FIX: No fallback secret
		if (!process.env.JWT_SECRET) {
			console.error("CRITICAL: JWT_SECRET environment variable is not set!");
			return res.status(500).json({ message: "Server configuration error" });
		}

		const token = jwt.sign(
			{ userId: newUser._id.toString(), email: newUser.email, isAdmin: newUser.isAdmin },
			process.env.JWT_SECRET,
			{ expiresIn: "1h" },
		);

		const userResponse = newUser.toObject();

		res.status(201).json({
			message: "User registered successfully",
			token,
			user: { ...userResponse, id: userResponse._id.toString(), password: undefined },
		});
	} catch (error) {
		console.error("Registration error:", error);
		res.status(500).json({ message: "Internal server error" });
	}
});

router.post("/login", loginLimiter, validate(loginSchema), async (req: Request, res: Response) => {
	try {
		const { identifier, password, mfaCode } = req.body;

		if (!identifier || !password) {
			return res.status(400).json({ message: "Missing credentials" });
		}

		const user = await User.findOne({
			$or: [{ email: identifier }, { username: identifier }],
		}).select("+mfaSecret");

		if (!user) {
			return res.status(400).json({ message: "Invalid credentials" });
		}

		const isValidPassword = await bcrypt.compare(password, user.password);
		if (!isValidPassword) {
			return res.status(400).json({ message: "Invalid credentials" });
		}

		// SECURITY FIX: No fallback secret
		if (!process.env.JWT_SECRET) {
			console.error("CRITICAL: JWT_SECRET environment variable is not set!");
			return res.status(500).json({ message: "Server configuration error" });
		}

		// Check if 2FA is enabled
		if (user.mfa && user.mfaSecret) {
			// If no MFA code provided, require it
			if (!mfaCode) {
				// Return a temporary token that can only be used for MFA verification
				const tempToken = jwt.sign(
					{ userId: user._id.toString(), email: user.email, mfaPending: true },
					process.env.JWT_SECRET,
					{ expiresIn: "5m" }, // Short expiry for MFA verification
				);

				return res.status(200).json({
					message: "2FA verification required",
					mfaRequired: true,
					tempToken,
				});
			}

			// Verify MFA code
			const speakeasy = await import("speakeasy");
			const isValidMfa = speakeasy.totp.verify({
				secret: user.mfaSecret,
				encoding: "base32",
				token: mfaCode,
				window: 1,
			});

			if (!isValidMfa) {
				// Also check backup codes
				const crypto = await import("crypto");
				const hashedCode = crypto.createHash("sha256").update(mfaCode.toUpperCase()).digest("hex");
				const backupIndex = user.mfaBackupCodes?.findIndex((c: string) => c === hashedCode);

				if (backupIndex === undefined || backupIndex < 0) {
					return res.status(400).json({ message: "Invalid 2FA code" });
				}

				// Remove used backup code
				user.mfaBackupCodes?.splice(backupIndex, 1);
				await user.save();
			}
		}

		const token = jwt.sign(
			{ userId: user._id.toString(), email: user.email, isAdmin: user.isAdmin },
			process.env.JWT_SECRET,
			{ expiresIn: "1h" },
		);

		const userResponse = user.toObject();

		res.status(200).json({
			message: "Login successful",
			token,
			user: { ...userResponse, id: userResponse._id.toString(), password: undefined, mfaSecret: undefined },
		});
	} catch (error) {
		console.error("Login error:", error);
		res.status(500).json({ message: "Internal server error" });
	}
});

router.post("/verify-token", async (req: Request, res: Response) => {
	try {
		const { token } = req.body;

		if (!token) {
			return res.status(400).json({ message: "Token required" });
		}

		// SECURITY FIX: No fallback secret
		if (!process.env.JWT_SECRET) {
			console.error("CRITICAL: JWT_SECRET environment variable is not set!");
			return res.status(500).json({ message: "Server configuration error" });
		}

		interface TokenPayload {
			userId: string;
			email: string;
			isAdmin?: boolean;
		}

		const decoded = jwt.verify(token, process.env.JWT_SECRET) as TokenPayload;

		const user = await User.findById(decoded.userId).select("-password");
		if (!user) {
			return res.status(404).json({ message: "User not found" });
		}

		const userResponse = user.toObject();

		res.status(200).json({
			message: "Token valid",
			user: { ...userResponse, id: userResponse._id.toString() },
		});
	} catch (error) {
		console.error("Token verification error:", error);
		res.status(401).json({ message: "Invalid token" });
	}
});

// Validate referral code endpoint
router.get("/validate-referral/:code", async (req: Request, res: Response) => {
	try {
		const { code } = req.params;

		if (!code) {
			return res.status(400).json({ message: "Referral code required" });
		}

		// Prepare query conditions
		const queryConditions: any[] = [{ username: code }];

		// Only add _id condition if code is a valid ObjectId
		if (mongoose.Types.ObjectId.isValid(code)) {
			queryConditions.push({ _id: code });
		}

		// Check if a user exists with this username or _id
		const user = await User.findOne({
			$or: queryConditions
		}).select("username _id");

		if (!user) {
			return res.status(404).json({ message: "Invalid referral code" });
		}

		res.status(200).json({
			message: "Valid referral code",
			referrer: {
				username: user.username,
				id: user._id
			}
		});
	} catch (error) {
		console.error("Referral validation error:", error);
		res.status(500).json({ message: "Error validating referral code" });
	}
});

export default router;
