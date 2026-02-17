import express, { Response } from "express";
import speakeasy from "speakeasy";
import QRCode from "qrcode";
import crypto from "crypto";
import { User } from "../models/user";
import { requireAuth, AuthRequest } from "../middleware/auth";

const router = express.Router();

// Generate backup codes
const generateBackupCodes = (count: number = 10): string[] => {
	const codes: string[] = [];
	for (let i = 0; i < count; i++) {
		codes.push(crypto.randomBytes(4).toString("hex").toUpperCase());
	}
	return codes;
};

// Hash backup codes for storage
const hashBackupCode = (code: string): string => {
	return crypto.createHash("sha256").update(code.toUpperCase()).digest("hex");
};

// Get 2FA status
router.get("/status", requireAuth, async (req: AuthRequest, res: Response) => {
	try {
		const user = await User.findById(req.user?.userId);
		if (!user) {
			return res.status(404).json({ message: "User not found" });
		}

		res.json({
			enabled: user.mfa,
			enabledAt: user.mfaEnabledAt || null,
		});
	} catch (error: any) {
		console.error("Error getting 2FA status:", error);
		res.status(500).json({ message: "Failed to get 2FA status" });
	}
});

// Initialize 2FA setup - generates secret and QR code
router.post("/setup", requireAuth, async (req: AuthRequest, res: Response) => {
	try {
		const user = await User.findById(req.user?.userId).select("+mfaSecret");
		if (!user) {
			return res.status(404).json({ message: "User not found" });
		}

		if (user.mfa) {
			return res.status(400).json({ message: "2FA is already enabled" });
		}

		// Generate a new secret
		const appName = process.env.APP_NAME || "InstantGlobal";
		const secret = speakeasy.generateSecret({
			name: `${appName} (${user.email})`,
			issuer: appName,
			length: 20,
		});

		// Generate QR code
		const qrCodeDataUrl = await QRCode.toDataURL(secret.otpauth_url || "");

		// Store secret temporarily (not enabled yet)
		user.mfaSecret = secret.base32;
		await user.save();

		res.json({
			secret: secret.base32,
			qrCode: qrCodeDataUrl,
			manualEntryKey: secret.base32,
			message: "Scan the QR code with your authenticator app, then verify with a code",
		});
	} catch (error: any) {
		console.error("Error setting up 2FA:", error);
		res.status(500).json({ message: "Failed to setup 2FA" });
	}
});

// Verify and enable 2FA
router.post("/enable", requireAuth, async (req: AuthRequest, res: Response) => {
	try {
		const { code } = req.body;

		if (!code || typeof code !== "string") {
			return res.status(400).json({ message: "Verification code is required" });
		}

		const user = await User.findById(req.user?.userId).select("+mfaSecret +mfaBackupCodes");
		if (!user) {
			return res.status(404).json({ message: "User not found" });
		}

		if (user.mfa) {
			return res.status(400).json({ message: "2FA is already enabled" });
		}

		if (!user.mfaSecret) {
			return res.status(400).json({ message: "Please run setup first" });
		}

		// Verify the code
		const isValid = speakeasy.totp.verify({
			secret: user.mfaSecret,
			encoding: "base32",
			token: code,
			window: 1,
		});

		if (!isValid) {
			return res.status(400).json({ message: "Invalid verification code" });
		}

		// Generate backup codes
		const backupCodes = generateBackupCodes(10);
		const hashedCodes = backupCodes.map(hashBackupCode);

		// Enable 2FA
		user.mfa = true;
		user.mfaBackupCodes = hashedCodes;
		user.mfaEnabledAt = new Date();
		await user.save();

		res.json({
			message: "2FA has been enabled successfully",
			backupCodes,
			warning: "Save these backup codes securely. Each code can only be used once.",
		});
	} catch (error: any) {
		console.error("Error enabling 2FA:", error);
		res.status(500).json({ message: "Failed to enable 2FA" });
	}
});

// Verify 2FA code (for login or sensitive operations)
router.post("/verify", requireAuth, async (req: AuthRequest, res: Response) => {
	try {
		const { code } = req.body;

		if (!code || typeof code !== "string") {
			return res.status(400).json({ message: "Verification code is required" });
		}

		const user = await User.findById(req.user?.userId).select("+mfaSecret +mfaBackupCodes");
		if (!user) {
			return res.status(404).json({ message: "User not found" });
		}

		if (!user.mfa || !user.mfaSecret) {
			return res.status(400).json({ message: "2FA is not enabled" });
		}

		// First try TOTP code
		const isValidTotp = speakeasy.totp.verify({
			secret: user.mfaSecret,
			encoding: "base32",
			token: code,
			window: 1,
		});

		if (isValidTotp) {
			return res.json({ valid: true, method: "totp" });
		}

		// Try backup code
		const hashedInput = hashBackupCode(code);
		const backupIndex = user.mfaBackupCodes?.findIndex((c) => c === hashedInput);

		if (backupIndex !== undefined && backupIndex >= 0) {
			// Remove used backup code
			user.mfaBackupCodes?.splice(backupIndex, 1);
			await user.save();

			return res.json({
				valid: true,
				method: "backup",
				remainingBackupCodes: user.mfaBackupCodes?.length || 0,
				warning: "Backup code used. Consider regenerating backup codes.",
			});
		}

		res.status(400).json({ valid: false, message: "Invalid code" });
	} catch (error: any) {
		console.error("Error verifying 2FA:", error);
		res.status(500).json({ message: "Failed to verify 2FA" });
	}
});

// Disable 2FA
router.post("/disable", requireAuth, async (req: AuthRequest, res: Response) => {
	try {
		const { code, password } = req.body;

		if (!code || !password) {
			return res.status(400).json({ message: "Code and password are required" });
		}

		const user = await User.findById(req.user?.userId).select("+mfaSecret +mfaBackupCodes +password");
		if (!user) {
			return res.status(404).json({ message: "User not found" });
		}

		if (!user.mfa) {
			return res.status(400).json({ message: "2FA is not enabled" });
		}

		// Verify password
		const bcrypt = await import("bcryptjs");
		const validPassword = await bcrypt.compare(password, user.password);
		if (!validPassword) {
			return res.status(400).json({ message: "Invalid password" });
		}

		// Verify the 2FA code
		const isValidTotp = user.mfaSecret
			? speakeasy.totp.verify({
					secret: user.mfaSecret,
					encoding: "base32",
					token: code,
					window: 1,
				})
			: false;

		// Also check backup codes
		const hashedInput = hashBackupCode(code);
		const isBackupCode = user.mfaBackupCodes?.includes(hashedInput);

		if (!isValidTotp && !isBackupCode) {
			return res.status(400).json({ message: "Invalid verification code" });
		}

		// Disable 2FA
		user.mfa = false;
		user.mfaSecret = undefined;
		user.mfaBackupCodes = [];
		user.mfaEnabledAt = undefined;
		await user.save();

		res.json({ message: "2FA has been disabled successfully" });
	} catch (error: any) {
		console.error("Error disabling 2FA:", error);
		res.status(500).json({ message: "Failed to disable 2FA" });
	}
});

// Regenerate backup codes
router.post("/backup-codes/regenerate", requireAuth, async (req: AuthRequest, res: Response) => {
	try {
		const { code } = req.body;

		if (!code) {
			return res.status(400).json({ message: "Current 2FA code is required" });
		}

		const user = await User.findById(req.user?.userId).select("+mfaSecret +mfaBackupCodes");
		if (!user) {
			return res.status(404).json({ message: "User not found" });
		}

		if (!user.mfa || !user.mfaSecret) {
			return res.status(400).json({ message: "2FA is not enabled" });
		}

		// Verify the code
		const isValid = speakeasy.totp.verify({
			secret: user.mfaSecret,
			encoding: "base32",
			token: code,
			window: 1,
		});

		if (!isValid) {
			return res.status(400).json({ message: "Invalid verification code" });
		}

		// Generate new backup codes
		const backupCodes = generateBackupCodes(10);
		const hashedCodes = backupCodes.map(hashBackupCode);

		user.mfaBackupCodes = hashedCodes;
		await user.save();

		res.json({
			message: "Backup codes regenerated successfully",
			backupCodes,
			warning: "Your old backup codes are now invalid. Save these new codes securely.",
		});
	} catch (error: any) {
		console.error("Error regenerating backup codes:", error);
		res.status(500).json({ message: "Failed to regenerate backup codes" });
	}
});

export default router;
