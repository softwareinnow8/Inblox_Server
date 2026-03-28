import express from "express";
import fetch from "node-fetch";

const router = express.Router();

// simple cache
const cache = new Map();

router.get("/", async (req, res) => {
  const { text, language } = req.query;

  if (!text || !language) {
    return res.status(400).json({ error: "Missing text or language" });
  }

  const key = `${language}-${text}`;

  try {
    // ✅ cache check
    if (cache.has(key)) {
      return res.json(cache.get(key));
    }

    // ✅ call Scratch API
    const response = await fetch(
      `https://translate-service.scratch.mit.edu/translate?language=${language}&text=${encodeURIComponent(text)}`
    );

    const data = await response.json();

    // ✅ save cache
    cache.set(key, data);

    res.json(data);

  } catch (error) {
    console.error("Translate error:", error);
    res.status(500).json({ error: "Translation failed" });
  }
});

export default router;