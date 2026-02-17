import { Request, Response, NextFunction } from "express";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";

// Login rate limiter: 10 attempts per 15 minutes
export const loginLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	max: 10, // 10 requests per window
	message: "Too many login attempts. Please try again after 15 minutes.",
	standardHeaders: true,
	legacyHeaders: false,
	// Use email from request body as key
	keyGenerator: (req: Request) => {
		return req.body.identifier || ipKeyGenerator(req.ip || "unknown");
	},
});

// Password reset rate limiter: 5 attempts per hour
export const passwordResetLimiter = rateLimit({
	windowMs: 60 * 60 * 1000, // 1 hour
	max: 5, // 5 requests per window
	message: "Too many password reset attempts. Please try again after 1 hour.",
	standardHeaders: true,
	legacyHeaders: false,
	keyGenerator: (req: Request) => {
		return req.body.email || ipKeyGenerator(req.ip || "unknown");
	},
});

// Registration rate limiter: 5 registrations per hour per IP
export const registrationLimiter = rateLimit({
	windowMs: 60 * 60 * 1000, // 1 hour
	max: 5, // 5 requests per window
	message: "Too many registration attempts. Please try again after 1 hour.",
	standardHeaders: true,
	legacyHeaders: false,
});

// Withdrawal rate limiter: 20 per hour per user
export const withdrawalLimiter = rateLimit({
	windowMs: 60 * 60 * 1000, // 1 hour
	max: 20,
	message: "Too many withdrawal requests. Please try again later.",
	standardHeaders: true,
	legacyHeaders: false,
	keyGenerator: (req: Request) => {
		return req.body.id || req.body.userId || ipKeyGenerator(req.ip || "unknown");
	},
});

// Deposit rate limiter: 20 per hour per user
export const depositLimiter = rateLimit({
	windowMs: 60 * 60 * 1000, // 1 hour
	max: 20,
	message: "Too many deposit requests. Please try again later.",
	standardHeaders: true,
	legacyHeaders: false,
	keyGenerator: (req: Request) => {
		return req.body.id || req.body.userId || ipKeyGenerator(req.ip || "unknown");
	},
});

// General API rate limiter: 200 requests per 15 minutes
export const generalLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	max: 200,
	message: "Too many requests. Please try again later.",
	standardHeaders: true,
	legacyHeaders: false,
});
