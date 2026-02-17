import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { User } from "../models/user";

export interface JWTPayload {
	userId: string;
	email: string;
	isAdmin?: boolean;
	role?: string;
	accountStatus?: string;
	iat?: number;
	exp?: number;
}

export interface AuthRequest extends Request {
	user?: JWTPayload;
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
	try {
		const authHeader = req.headers.authorization;
		if (!authHeader) {
			return res.status(401).json({ message: "Missing authorization header" });
		}

		const token = authHeader.replace("Bearer ", "");

		// SECURITY FIX: No fallback secret, fail if JWT_SECRET is missing
		if (!process.env.JWT_SECRET) {
			console.error("CRITICAL: JWT_SECRET environment variable is not set!");
			return res.status(500).json({ message: "Server configuration error" });
		}

		const payload = jwt.verify(token, process.env.JWT_SECRET) as JWTPayload;
		const dbUser = await User.findById(payload.userId).select("_id email isAdmin role accountStatus");
		if (!dbUser) {
			return res.status(401).json({ message: "Invalid token user" });
		}

		req.user = {
			userId: String(dbUser._id),
			email: dbUser.email,
			isAdmin: Boolean(dbUser.isAdmin || dbUser.role === "admin"),
			role: dbUser.role,
			accountStatus: dbUser.accountStatus,
		};
		return next();
	} catch (err: unknown) {
		const error = err as Error;
		console.error("Auth error:", error.message);
		return res.status(401).json({ message: "Invalid or expired token" });
	}
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
	if (!req.user?.isAdmin) {
		return res.status(403).json({ message: "Admin access required" });
	}
	return next();
}

// SECURITY FIX: New middleware to verify user can only access their own data
export function requireSelfOrAdmin(req: AuthRequest, res: Response, next: NextFunction) {
	const targetUserId = req.params.id || req.params.userId || req.body.userId || req.body.id;

	if (!targetUserId) {
		return res.status(400).json({ message: "User ID required" });
	}

	// Allow if admin OR if accessing own data
	if (req.user?.isAdmin || req.user?.userId === targetUserId) {
		return next();
	}

	return res.status(403).json({ message: "Access denied: You can only access your own data" });
}
