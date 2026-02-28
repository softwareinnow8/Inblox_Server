import mongoose from "mongoose";

const otpSchema = new mongoose.Schema({
  phone: { type: String, required: true, unique: true },
  otpHash: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  attempts: { type: Number, default: 0 },
  sendCount: { type: Number, default: 0 },
  windowStart: { type: Date, default: Date.now },
  lockedUntil: { type: Date, default: null }
});

export default mongoose.model("OTP", otpSchema);