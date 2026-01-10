import express, { Request, Response } from "express";
import amadeusService from "../services/amadeusService";
import { requireAuth } from "../middleware/auth";
import { Transaction } from "../models/transaction";
import { User } from "../models/user";

const router = express.Router();

/**
 * @route GET /api/flights/search
 * @desc Search for flights
 * @access Private (requires authentication)
 * @query origin - Origin airport code (e.g., "LAX")
 * @query destination - Destination airport code (e.g., "JFK")
 * @query date - Departure date (YYYY-MM-DD)
 * @query adults - Number of adults (optional, default: 1)
 * @query class - Travel class (optional: ECONOMY, PREMIUM_ECONOMY, BUSINESS, FIRST)
 * @query nonStop - Non-stop flights only (optional, default: false)
 * @query max - Maximum results (optional, default: 10)
 */
router.get("/search", requireAuth, async (req: Request, res: Response) => {
  try {
    const { origin, destination, date, adults, class: travelClass, nonStop, max } = req.query;

    // Validation
    if (!origin || !destination || !date) {
      return res.status(400).json({
        success: false,
        message: "Origin, destination, and date are required",
      });
    }

    // Validate airport codes (3 letters)
    const airportCodeRegex = /^[A-Z]{3}$/;
    if (!airportCodeRegex.test(origin as string) || !airportCodeRegex.test(destination as string)) {
      return res.status(400).json({
        success: false,
        message: "Invalid airport code format. Use 3-letter IATA codes (e.g., LAX, JFK)",
      });
    }

    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date as string)) {
      return res.status(400).json({
        success: false,
        message: "Invalid date format. Use YYYY-MM-DD",
      });
    }

    // Validate date is not in the past
    const departureDate = new Date(date as string);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (departureDate < today) {
      return res.status(400).json({
        success: false,
        message: "Departure date cannot be in the past",
      });
    }

    // Search for flights
    const flights = await amadeusService.searchFlights({
      origin: (origin as string).toUpperCase(),
      destination: (destination as string).toUpperCase(),
      departureDate: date as string,
      adults: adults ? parseInt(adults as string) : 1,
      travelClass: (travelClass as any) || "ECONOMY",
      nonStop: nonStop === "true",
      maxResults: max ? parseInt(max as string) : 10,
    });

    return res.status(200).json({
      success: true,
      count: flights.length,
      data: flights,
      usingMockData: !amadeusService.isConfigured(),
    });
  } catch (error: any) {
    console.error("Flight search error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to search flights",
      error: error.message,
    });
  }
});

/**
 * @route POST /api/flights/book
 * @desc Book a flight (creates transaction)
 * @access Private (requires authentication)
 * @body flightId - ID of the flight offer
 * @body price - Price of the flight
 * @body origin - Origin airport code
 * @body destination - Destination airport code
 * @body departureTime - Departure time
 * @body carrier - Airline carrier name
 */
router.post("/book", requireAuth, async (req: Request, res: Response) => {
  try {
    const { flightId, price, origin, destination, departureTime, carrier } = req.body;
    const userId = (req as any).user?.userId || (req as any).userId;

    // Validation
    if (!userId || !flightId || !price || !origin || !destination || !departureTime || !carrier) {
      return res.status(400).json({
        success: false,
        message: "Missing required booking information",
      });
    }

    if (price <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid flight price",
      });
    }

    // Calculate platform fee (1.8% as mentioned in the flights page)
    const platformFeePercent = 1.8;
    const platformFee = (price * platformFeePercent) / 100;
    const totalAmount = price + platformFee;

    const user = await User.findById(userId).select("email firstName lastName");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found for booking",
      });
    }

    const transaction = await Transaction.create({
      type: "flight_booking",
      user: { id: user._id, email: user.email, name: `${user.firstName} ${user.lastName}` },
      amount: totalAmount * -1,
      currency: "USD",
      status: "pending",
      description: `Flight booking: ${origin} -> ${destination} (${carrier})`,
      metadata: {
        flightId,
        origin,
        destination,
        departureTime,
        carrier,
        platformFeePercent,
        platformFee,
        totalAmount,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Flight booking request submitted",
      data: {
        transactionId: transaction._id,
        flightId,
        price,
        platformFee,
        totalAmount,
        status: "pending",
      },
    });
  } catch (error: any) {
    console.error("Flight booking error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to book flight",
      error: error.message,
    });
  }
});

/**
 * @route GET /api/flights/status
 * @desc Check if Amadeus API is configured
 * @access Public
 */
router.get("/status", async (req: Request, res: Response) => {
  try {
    const isConfigured = amadeusService.isConfigured();

    return res.status(200).json({
      success: true,
      configured: isConfigured,
      message: isConfigured
        ? "Amadeus API is configured and ready"
        : "Amadeus API not configured - using mock data",
    });
  } catch (error: any) {
    console.error("Flight status check error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to check flight service status",
      error: error.message,
    });
  }
});

export default router;
