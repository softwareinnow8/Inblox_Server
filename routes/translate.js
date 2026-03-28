import express from "express";
import axios from "axios";

const router = express.Router();

// simple cache
const cache = new Map();

router.get("/", async (req, res) => {
  const { text, language } = req.body;

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
    const response = await axios.get(
      "https://translate-service.scratch.mit.edu/translate",
      {
        params: {
          language,
          text,
        },
      }
    );

    const data = response.data;

    // ✅ save cache
    cache.set(key, data);

    res.json(data);

  } catch (error) {
    console.error("Translate error:", error);
    res.status(500).json({ error: "Translation failed" });
  }
});

export default router;