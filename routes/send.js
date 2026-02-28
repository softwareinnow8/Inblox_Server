import express from "express";
import rateLimit from "express-rate-limit";
import otp from "../models/otp.js";
import { PublishCommand } from "@aws-sdk/client-sns";
import snsClient from "../config/sns.js";
import { generateOTP, hashOTP } from "../utils/otp.js";

const router = express.Router();

const OTP_EXPIRY_MS = 5 * 60 * 1000;
const RESEND_WINDOW_MS = 10 * 60 * 1000;
const MAX_RESEND_ATTEMPTS = 3;
const MAX_VERIFY_ATTEMPTS = 5;
const LOCK_DURATION_MS = 10 * 60 * 1000;

const otpIpLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many OTP requests from this IP. Please try again later." },
});

router.post("/send-otp", otpIpLimiter, async (req, res) => {
    try {
        const { phone } = req.body;

        if (!phone) {
            return res.status(400).json({ error: "Phone number is required" });
        }

        const now = new Date();
        const existingRecord = await otp.findOne({ phone });

        if (existingRecord?.lockedUntil && existingRecord.lockedUntil > now) {
            return res.status(423).json({
                error: "OTP verification is temporarily locked due to too many wrong attempts.",
                lockedUntil: existingRecord.lockedUntil,
            });
        }

        const withinWindow =
            existingRecord?.windowStart && now.getTime() - new Date(existingRecord.windowStart).getTime() < RESEND_WINDOW_MS;

        if (withinWindow && existingRecord.sendCount >= MAX_RESEND_ATTEMPTS) {
            return res.status(429).json({
                error: "Maximum OTP resend limit reached. Please try again later.",
            });
        }

        const generatedOtp = generateOTP();
        const otpHash = hashOTP(generatedOtp);

        const params = {
            Message: `Your OTP code is ${generatedOtp}. It will expire in 5 minutes.`,
            PhoneNumber: phone,
        };

        await snsClient.send(new PublishCommand(params));

        const windowStart = withinWindow ? existingRecord.windowStart : now;
        const sendCount = withinWindow ? (existingRecord.sendCount || 0) + 1 : 1;

        await otp.findOneAndUpdate(
            { phone },
            {
                phone,
                otpHash,
                expiresAt: new Date(now.getTime() + OTP_EXPIRY_MS),
                attempts: 0,
                lockedUntil: null,
                windowStart,
                sendCount,
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        return res.json({ message: "OTP sent successfully" });
    } catch (error) {
        console.error("Error sending OTP:", error);
        return res.status(500).json({ error: "Failed to send OTP" });
    }
});

router.post("/verify-otp", otpIpLimiter, async (req, res) => {
    try {
        const { phone, otpCode } = req.body;

        if (!phone || !otpCode) {
            return res.status(400).json({ error: "Phone number and OTP are required" });
        }

        const now = new Date();
        const otpRecord = await otp.findOne({ phone });

        if (!otpRecord) {
            return res.status(404).json({ error: "OTP not found. Please request a new OTP." });
        }

        if (otpRecord.lockedUntil && otpRecord.lockedUntil > now) {
            return res.status(423).json({
                error: "Too many wrong attempts. OTP verification is temporarily locked.",
                lockedUntil: otpRecord.lockedUntil,
            });
        }

        if (otpRecord.expiresAt < now) {
            await otp.deleteOne({ _id: otpRecord._id });
            return res.status(400).json({ error: "OTP has expired. Please request a new OTP." });
        }

        const submittedOtpHash = hashOTP(String(otpCode));
        if (submittedOtpHash !== otpRecord.otpHash) {
            const updatedAttempts = (otpRecord.attempts || 0) + 1;
            const lockNow = updatedAttempts >= MAX_VERIFY_ATTEMPTS;

            await otp.updateOne(
                { _id: otpRecord._id },
                {
                    $set: {
                        attempts: updatedAttempts,
                        lockedUntil: lockNow ? new Date(now.getTime() + LOCK_DURATION_MS) : otpRecord.lockedUntil,
                    },
                }
            );

            return res.status(401).json({
                error: lockNow
                    ? "Too many wrong attempts. OTP verification has been locked temporarily."
                    : "Invalid OTP.",
                attemptsLeft: Math.max(0, MAX_VERIFY_ATTEMPTS - updatedAttempts),
            });
        }

        await otp.deleteOne({ _id: otpRecord._id });
        return res.json({ message: "OTP verified successfully" });
    } catch (error) {
        console.error("Error verifying OTP:", error);
        return res.status(500).json({ error: "Failed to verify OTP" });
    }
});

export default router;