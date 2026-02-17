// IMPORTANT: Load environment variables FIRST before any other imports
import dotenv from "dotenv";
dotenv.config({ debug: false });

// Now import everything else after env is loaded
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import mongoose from "mongoose";
import path from "path";

// Import routes AFTER environment variables are loaded
import authRoutes from "./routes/auth";
import userRoutes from "./routes/users";
import withdrawalRoutes from "./routes/withdrawals";
import depositRoutes from "./routes/deposits";
import utilsRoutes from "./routes/utils";
import transactionsRoutes from "./routes/transactions";
import plansRoutes from "./routes/plans";
import kycRoutes from "./routes/kycs";
import bankingRoutes from "./routes/banking";
import contactRoutes from "./routes/contact";
import flightRoutes from "./routes/flights";
import mfaRoutes from "./routes/mfa";
import cardsRoutes from "./routes/cards";
import giftcardsRoutes from "./routes/giftcards";

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(helmet());
const allowedOrigins = [
	"http://localhost:5173",
	"http://localhost:5174",
	"http://localhost:3000",
	"https://instantsglobal.com",
	"https://www.instantsglobal.com",
	"https://instantsglobal.com",
];

// ✅ Configure CORS dynamically
app.use(
	cors({
		origin: (origin, callback) => {
			if (!origin) return callback(null, true);
			if (allowedOrigins.includes(origin)) {
				callback(null, true);
			} else {
				callback(new Error("Not allowed by CORS"));
			}
		},
		credentials: true,
	}),
);
app.use(morgan("combined"));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Serve static files
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));
app.use("/uploads/profile-images", express.static(path.join(__dirname, "../uploads/profile-images")));

// Database connection
const connectDB = async () => {
	try {
		console.log("🔄 Attempting to connect to MongoDB...");
		const conn = await mongoose.connect(process.env.MONGODB_URI || "");
		console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
	} catch (error) {
		console.error("❌ Error connecting to MongoDB:", error);
		process.exit(1);
	}
};

// Health check endpoint
app.get("/api/health", async (req, res) => {
	try {
		res.json({
			status: "healthy",
			timestamp: new Date().toISOString(),
			database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
		});
	} catch (error: any) {
		res.status(500).json({
			status: "error",
			timestamp: new Date().toISOString(),
			error: error.message,
		});
	}
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/withdrawals", withdrawalRoutes);
app.use("/api/deposits", depositRoutes);
app.use("/api/utils", utilsRoutes);
app.use("/api/transactions", transactionsRoutes);
app.use("/api/plans", plansRoutes);
app.use("/api/kycs", kycRoutes);
app.use("/api/banking", bankingRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/flights", flightRoutes);
app.use("/api/mfa", mfaRoutes);
app.use("/api/cards", cardsRoutes);
app.use("/api/giftcards", giftcardsRoutes);

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
	console.error(err.stack);
	res.status(500).json({
		message: "Something went wrong!",
		error: process.env.NODE_ENV === "development" ? err.message : "Internal server error",
	});
});

// 404 handler
app.use((req, res) => {
	res.status(404).json({
		message: "Route not found",
	});
});

// Start server
const startServer = async () => {
	try {
		await connectDB();

		const server = app.listen(PORT, () => {
			console.log(`🚀 Server running on port ${PORT}`);
			console.log(`📊 Environment: ${process.env.NODE_ENV}`);
			console.log(`🔧 Withdrawal processing: Manual approval mode`);
		});

		server.on("error", (error: any) => {
			console.error("Server error:", error);
			if (error.code === "EADDRINUSE") {
				console.error(`Port ${PORT} is already in use`);
			}
		});
	} catch (error) {
		console.error("Failed to start server:", error);
		process.exit(1);
	}
};

startServer().catch((error) => {
	console.error("Failed to start server:", error);
	process.exit(1);
});

