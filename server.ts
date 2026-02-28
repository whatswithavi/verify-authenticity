import express from "express";
import { createServer as createViteServer } from "vite";
import multer from "multer";
import path from "path";
import Database from "better-sqlite3";
import { GoogleGenAI } from "@google/genai";
import exifParser from "exif-parser";
import { config } from "dotenv";
config();

// Initialize database
const db = new Database("authenticity.db");
db.exec(`
  CREATE TABLE IF NOT EXISTS analysis_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_email TEXT,
    type TEXT,
    content TEXT,
    result TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Helper: parse JSON from Gemini response robustly
function parseJSON(text: string): any {
  let t = (text || "").replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  try { return JSON.parse(t); } catch { /* try regex */ }
  const m = t.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch { /* fall through */ } }
  return {};
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: "10mb" }));
  const upload = multer({ storage: multer.memoryStorage() });
  const getAI = () => new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const MODEL = "gemini-2.5-flash-lite";

  const isQuotaError = (e: any) =>
    e?.status === 429 || String(e?.message || "").includes("429") || String(e?.message || "").includes("RESOURCE_EXHAUSTED");

  // ── Mock fallbacks ────────────────────────────────────────────────────────
  const mockTextResult = (text: string) => ({
    aiProbability: text.length > 300 ? 72 : 34,
    humanProbability: text.length > 300 ? 28 : 66,
    confidence: "Medium",
    explanation: `**⚠️ Demo Mode** (API quota reset pending)\n\nBased on linguistic pattern analysis of the ${text.split(" ").length}-word text, structural uniformity and hedging language appear at above-average frequency. This is a demonstration; full AI-powered detection resumes when the quota resets.`,
    plagiarism: { isPlagiarized: false, sources: [], score: 12 },
    credibility: { rating: "Unverified", reason: "No source URL provided." },
    comparison: { humanTraits: "Personal anecdotes, irregular sentence lengths.", detectedTraits: "Consistent structure, formal transitions." },
    suspiciousSections: []
  });

  const mockImageResult = () => ({
    aiProbability: 41, humanProbability: 59, confidence: "Medium",
    explanation: "**⚠️ Demo Mode** — API quota pending. Full forensic image analysis will resume when quota resets.",
    watermarkDetected: false, manipulatedRegions: [], reverseSearch: { found: false, similarSources: [] }
  });

  const mockVideoResult = () => ({
    aiProbability: 18, humanProbability: 82, confidence: "Low",
    explanation: "**⚠️ Demo Mode** — Full deepfake video analysis pending quota reset.",
    deepfakeSigns: ["Demo mode — real analysis pending quota reset"]
  });

  const mockLinkResult = () => ({
    aiProbability: 55, humanProbability: 45, confidence: "Low",
    explanation: "**⚠️ Demo Mode** — URL verification pending quota reset.",
    sourceRating: "Unverified", isFake: false
  });

  const mockProfileResult = () => ({
    isAIInfluencer: false, botProbability: 38, humanProbability: 62,
    explanation: "**⚠️ Demo Mode** — Profile analysis pending quota reset.",
    redFlags: ["API quota limit reached"]
  });
  // ─────────────────────────────────────────────────────────────────────────

  // TEXT ANALYSIS
  app.post("/api/analyze/text", async (req, res) => {
    const { text, userEmail, language = "English" } = req.body;
    if (!text) return res.status(400).json({ error: "Text is required" });
    try {
      const ai = getAI();
      const response = await ai.models.generateContent({
        model: MODEL,
        contents: `Analyze the following ${language} text for AI generation vs human authorship.
Return ONLY a valid JSON object with this exact structure:
{
  "aiProbability": <number 0-100>,
  "humanProbability": <number 0-100>,
  "confidence": "<High|Medium|Low>",
  "explanation": "<detailed analysis>",
  "plagiarism": { "isPlagiarized": false, "sources": [], "score": 0 },
  "credibility": { "rating": "<Trusted|Unverified|Risky>", "reason": "<reason>" },
  "comparison": { "humanTraits": "<traits>", "detectedTraits": "<traits>" },
  "suspiciousSections": [{ "text": "<excerpt>", "reason": "<reason>", "severity": "<High|Medium|Low>" }]
}
Rules: aiProbability + humanProbability = 100. ONLY return JSON.

Text: ${text}`
      });
      const result = parseJSON(response.text || "");
      if (result.aiProbability != null && result.humanProbability == null) {
        result.humanProbability = 100 - result.aiProbability;
      }
      db.prepare("INSERT INTO analysis_history (user_email, type, content, result) VALUES (?, ?, ?, ?)")
        .run(userEmail || "anonymous", "text", text.substring(0, 500), JSON.stringify(result));
      res.json(result);
    } catch (error: any) {
      console.error("Text error:", error.message);
      if (isQuotaError(error)) return res.json(mockTextResult(text));
      res.status(500).json({ error: error.message });
    }
  });

  // IMAGE ANALYSIS
  app.post("/api/analyze/image", upload.single("image"), async (req, res) => {
    const { userEmail } = req.body;
    const file = req.file;
    if (!file) return res.status(400).json({ error: "Image is required" });
    try {
      let exifData = {};
      try { exifData = exifParser.create(file.buffer).parse(); } catch { /* skip */ }

      const ai = getAI();
      const base64Image = file.buffer.toString("base64");

      const response = await ai.models.generateContent({
        model: MODEL,
        contents: {
          parts: [
            {
              text: `You are a forensic image analyst. Examine this image for AI generation or manipulation.
Return ONLY a valid JSON object with this exact structure:
{
  "aiProbability": <number 0-100>,
  "humanProbability": <number 0-100>,
  "confidence": "<High|Medium|Low>",
  "explanation": "<2-3 sentences of specific forensic evidence>",
  "watermarkDetected": <true|false>,
  "manipulatedRegions": [{"region": "<area>", "issue": "<issue>", "severity": "<High|Medium|Low>"}],
  "reverseSearch": {"found": false, "similarSources": []}
}
Rules:
- aiProbability + humanProbability = 100
- Real photos of real people/places: aiProbability 5-30
- Clearly AI-generated: aiProbability 70-99
- ONLY return the JSON, no other text`
            },
            { inlineData: { mimeType: file.mimetype, data: base64Image } }
          ]
        }
      });

      const result = parseJSON(response.text || "");
      if (result.aiProbability != null && result.humanProbability == null) {
        result.humanProbability = 100 - result.aiProbability;
      }
      result.exif = exifData;

      db.prepare("INSERT INTO analysis_history (user_email, type, content, result) VALUES (?, ?, ?, ?)")
        .run(userEmail || "anonymous", "image", `Image: ${file.originalname || "upload"}`, JSON.stringify(result));
      res.json(result);
    } catch (error: any) {
      console.error("Image error:", error.message);
      if (isQuotaError(error)) return res.json(mockImageResult());
      res.status(500).json({ error: error.message });
    }
  });

  // VIDEO ANALYSIS
  app.post("/api/analyze/video", upload.single("video"), async (req, res) => {
    const { userEmail } = req.body;
    const file = req.file;
    if (!file) return res.status(400).json({ error: "Video is required" });
    try {
      const ai = getAI();
      const base64Video = file.buffer.toString("base64");
      const response = await ai.models.generateContent({
        model: MODEL,
        contents: {
          parts: [
            {
              text: `Analyze this video for deepfake manipulation. Return ONLY valid JSON:
{
  "aiProbability": <number 0-100>,
  "humanProbability": <number 0-100>,
  "confidence": "<High|Medium|Low>",
  "explanation": "<detailed analysis>",
  "deepfakeSigns": ["<sign1>", "<sign2>"]
}`
            },
            { inlineData: { mimeType: file.mimetype, data: base64Video } }
          ]
        }
      });
      const result = parseJSON(response.text || "");
      if (result.aiProbability != null && result.humanProbability == null) {
        result.humanProbability = 100 - result.aiProbability;
      }
      db.prepare("INSERT INTO analysis_history (user_email, type, content, result) VALUES (?, ?, ?, ?)")
        .run(userEmail || "anonymous", "video", `Video: ${file.originalname}`, JSON.stringify(result));
      res.json(result);
    } catch (error: any) {
      console.error("Video error:", error.message);
      if (isQuotaError(error)) return res.json(mockVideoResult());
      res.status(500).json({ error: error.message });
    }
  });

  // LINK ANALYSIS
  app.post("/api/analyze/link", async (req, res) => {
    const { url, userEmail } = req.body;
    if (!url) return res.status(400).json({ error: "URL is required" });
    try {
      const ai = getAI();
      const response = await ai.models.generateContent({
        model: MODEL,
        contents: `Analyze this URL for authenticity and misinformation. Return ONLY valid JSON:
{
  "aiProbability": <number 0-100>,
  "humanProbability": <number 0-100>,
  "confidence": "<High|Medium|Low>",
  "explanation": "<analysis>",
  "sourceRating": "<Trusted|Unverified|Risky>",
  "isFake": <true|false>
}
URL: ${url}`
      });
      const result = parseJSON(response.text || "");
      if (result.aiProbability != null && result.humanProbability == null) {
        result.humanProbability = 100 - result.aiProbability;
      }
      db.prepare("INSERT INTO analysis_history (user_email, type, content, result) VALUES (?, ?, ?, ?)")
        .run(userEmail || "anonymous", "link", url, JSON.stringify(result));
      res.json(result);
    } catch (error: any) {
      console.error("Link error:", error.message);
      if (isQuotaError(error)) return res.json(mockLinkResult());
      res.status(500).json({ error: error.message });
    }
  });

  // PROFILE ANALYSIS
  app.post("/api/analyze/profile", async (req, res) => {
    const { profileUrl, userEmail } = req.body;
    if (!profileUrl) return res.status(400).json({ error: "Profile URL is required" });
    try {
      const ai = getAI();
      const response = await ai.models.generateContent({
        model: MODEL,
        contents: `Analyze this social media profile URL to determine if it's real or a bot/AI. Return ONLY valid JSON:
{
  "isAIInfluencer": <true|false>,
  "botProbability": <number 0-100>,
  "humanProbability": <number 0-100>,
  "explanation": "<analysis>",
  "redFlags": ["<flag1>", "<flag2>"]
}
Profile: ${profileUrl}`
      });
      const result = parseJSON(response.text || "");
      db.prepare("INSERT INTO analysis_history (user_email, type, content, result) VALUES (?, ?, ?, ?)")
        .run(userEmail || "anonymous", "profile", profileUrl, JSON.stringify(result));
      res.json(result);
    } catch (error: any) {
      console.error("Profile error:", error.message);
      if (isQuotaError(error)) return res.json(mockProfileResult());
      res.status(500).json({ error: error.message });
    }
  });

  // CHAT
  app.post("/api/chat", async (req, res) => {
    const { message } = req.body;
    try {
      const ai = getAI();
      const chat = ai.chats.create({
        model: MODEL,
        config: { systemInstruction: "You are the VERIFY AI Assistant. Help users understand content authenticity, deepfakes, and how to use the platform." }
      });
      const response = await chat.sendMessage({ message });
      res.json({ text: response.text });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // HISTORY
  app.get("/api/history", (req, res) => {
    const { email } = req.query;
    const history = db.prepare("SELECT * FROM analysis_history WHERE user_email = ? ORDER BY created_at DESC LIMIT 20")
      .all(email || "anonymous");
    res.json(history);
  });

  // Vite dev middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
    app.get("*", (_req, res) => {
      res.sendFile(path.resolve("dist/index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
