import express from "express";
import { sendContactFormEmail } from "../utils/mailer";

const router = express.Router();

interface ContactFormData {
  name: string;
  email: string;
  company?: string;
  subject: string;
  message?: string;
}

/**
 * @route POST /api/contact
 * @desc Submit contact form
 * @access Public
 */
router.post("/", async (req, res) => {
  try {
    const { name, email, company, subject, message }: ContactFormData = req.body;

    // Validation
    if (!name || !email || !subject) {
      return res.status(400).json({
        success: false,
        message: "Name, email, and subject are required",
      });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email address",
      });
    }

    // Rate limiting check (simple in-memory implementation)
    // In production, use Redis or similar
    const userEmail = email.toLowerCase();
    const now = Date.now();
    const rateLimit = (global as any).contactFormRateLimits || new Map();
    (global as any).contactFormRateLimits = rateLimit;

    const lastSubmission = rateLimit.get(userEmail);
    if (lastSubmission && now - lastSubmission < 60000 * 5) {
      // 5 minutes cooldown
      return res.status(429).json({
        success: false,
        message: "Please wait 5 minutes before submitting another message",
      });
    }

    // Send email to support team
    await sendContactFormEmail({
      name,
      email,
      company,
      subject,
      message,
    });

    // Update rate limit
    rateLimit.set(userEmail, now);

    // Clean up old rate limit entries (older than 1 hour)
    const oneHourAgo = now - 60000 * 60;
    for (const [key, timestamp] of rateLimit.entries()) {
      if (timestamp < oneHourAgo) {
        rateLimit.delete(key);
      }
    }

    return res.status(200).json({
      success: true,
      message: "Thank you for contacting us! We'll get back to you within 24 hours.",
    });
  } catch (error: any) {
    console.error("Contact form error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to send message. Please try again later.",
      error: error.message,
    });
  }
});

export default router;
