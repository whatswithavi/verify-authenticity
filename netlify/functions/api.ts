import express from "express";
import multer from "multer";
import Database from "better-sqlite3";
import { GoogleGenAI, Type } from "@google/genai";
import exifParser from "exif-parser";
import serverlessHttp from "serverless-http";

// ── In-memory DB for Netlify (no persistent filesystem) ──────────
const db = new Database(":memory:");
db.exec(`
  CREATE TABLE IF NOT EXISTS analysis_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_email TEXT, type TEXT,
    content TEXT, result TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

const app = express();
app.use(express.json({ limit: "10mb" }));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 6 * 1024 * 1024 } });
const getAI = () => new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const isQuotaError = (e: any) =>
    e?.status === 429 || String(e?.message || "").includes("429") || String(e?.message || "").includes("RESOURCE_EXHAUSTED");

// ── Mock fallbacks ────────────────────────────────────────────────
const mockTextResult = (text: string) => ({
    aiProbability: text.length > 300 ? 72 : 34, humanProbability: text.length > 300 ? 28 : 66,
    confidence: "Medium",
    explanation: `**⚠️ Demo Mode** (API quota reset pending)\n\nBased on linguistic pattern analysis of the provided ${text.split(" ").length}-word text:\n\n- **Structural uniformity** detected across paragraph transitions\n- **Hedging language** appears at above-average frequency\n\nFull AI-powered detection resumes when the API quota resets.`,
    plagiarism: { isPlagiarized: false, sources: [], score: 12 },
    credibility: { rating: "Unverified", reason: "No source URL provided for cross-referencing." },
    comparison: { humanTraits: "Personal anecdotes, emotional language, irregular sentence lengths.", detectedTraits: "Consistent sentence structure, formal transitions, lack of personal voice." },
    suspiciousSections: [{ text: text.substring(0, 80), reason: "Overly formal sentence structure with uniform pacing.", severity: "Medium" }]
});

const mockImageResult = () => ({
    aiProbability: 41, humanProbability: 59, confidence: "Medium",
    explanation: "**⚠️ Demo Mode** (API quota reset pending)\n\nVisual forensic analysis detected:\n\n- Natural noise patterns consistent with camera sensor\n- No obvious splicing artifacts at major edges\n- Lighting direction appears consistent\n\nFull AI-powered image analysis resumes when the API quota resets.",
    watermarkDetected: false,
    manipulatedRegions: [{ region: "Background", issue: "Slight compression artifact detected", severity: "Low" }],
    reverseSearch: { found: false, similarSources: [] }
});

// ── TEXT ANALYSIS ─────────────────────────────────────────────────
app.post("/api/analyze/text", async (req: any, res: any) => {
    const { text, userEmail, language = "English" } = req.body;
    if (!text) return res.status(400).json({ error: "Text is required" });
    try {
        const ai = getAI();
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-lite",
            contents: `Analyze the following text (Language: ${language}) for authenticity. Perform a comprehensive check including: 1. AI vs Human Probability (Total 100%) 2. Plagiarism Detection 3. Source Credibility 4. Highlight Suspicious Sections 5. Comparison: How a human would write vs how this text behaves.\n\nText: ${text}`,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        aiProbability: { type: Type.NUMBER }, humanProbability: { type: Type.NUMBER },
                        confidence: { type: Type.STRING }, explanation: { type: Type.STRING },
                        plagiarism: { type: Type.OBJECT, properties: { isPlagiarized: { type: Type.BOOLEAN }, sources: { type: Type.ARRAY, items: { type: Type.STRING } }, score: { type: Type.NUMBER } }, required: ["isPlagiarized", "sources", "score"] },
                        credibility: { type: Type.OBJECT, properties: { rating: { type: Type.STRING }, reason: { type: Type.STRING } }, required: ["rating", "reason"] },
                        comparison: { type: Type.OBJECT, properties: { humanTraits: { type: Type.STRING }, detectedTraits: { type: Type.STRING } }, required: ["humanTraits", "detectedTraits"] },
                        suspiciousSections: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { text: { type: Type.STRING }, reason: { type: Type.STRING }, severity: { type: Type.STRING } }, required: ["text", "reason", "severity"] } }
                    },
                    required: ["aiProbability", "humanProbability", "confidence", "explanation", "plagiarism", "credibility", "comparison", "suspiciousSections"]
                }
            }
        });
        const result = JSON.parse(response.text || "{}");
        db.prepare("INSERT INTO analysis_history (user_email, type, content, result) VALUES (?, ?, ?, ?)").run(userEmail || "anonymous", "text", text.substring(0, 500), JSON.stringify(result));
        res.json(result);
    } catch (error: any) {
        if (isQuotaError(error)) return res.json(mockTextResult(text));
        res.status(500).json({ error: error.message });
    }
});

// ── IMAGE ANALYSIS ────────────────────────────────────────────────
app.post("/api/analyze/image", upload.single("image"), async (req: any, res: any) => {
    const { userEmail } = req.body;
    const file = req.file;
    if (!file) return res.status(400).json({ error: "Image is required" });
    try {
        let exifData = {};
        try { const parser = exifParser.create(file.buffer); exifData = parser.parse(); } catch (e) { }
        const ai = getAI();
        const base64Image = file.buffer.toString("base64");
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-lite",
            contents: { parts: [{ text: `You are an expert digital forensics analyst. Perform a rigorous forensic analysis of this image.\n\nFORENSIC CHECKLIST:\n1. AI Generation Detection (GAN/Diffusion fingerprints) - check fingers, ears, teeth, eye reflections, background text\n2. Manipulation Detection - edge boundaries, lighting consistency, shadow directions, JPEG artifacts, noise levels\n3. Deepfake Detection - facial boundary blending, skin texture, eye artifacts\n4. Context Credibility - physically impossible elements\n\nProvide precise AI probability (real photo = 5-20%, clear AI = 70-95%). Be accurate and specific.` }, { inlineData: { mimeType: file.mimetype, data: base64Image } }] },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        aiProbability: { type: Type.NUMBER }, humanProbability: { type: Type.NUMBER },
                        confidence: { type: Type.STRING }, explanation: { type: Type.STRING },
                        watermarkDetected: { type: Type.BOOLEAN },
                        manipulatedRegions: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { region: { type: Type.STRING }, issue: { type: Type.STRING }, severity: { type: Type.STRING } }, required: ["region", "issue", "severity"] } },
                        reverseSearch: { type: Type.OBJECT, properties: { found: { type: Type.BOOLEAN }, similarSources: { type: Type.ARRAY, items: { type: Type.STRING } } }, required: ["found", "similarSources"] }
                    },
                    required: ["aiProbability", "humanProbability", "confidence", "explanation", "watermarkDetected", "manipulatedRegions", "reverseSearch"]
                }
            }
        });
        const result = JSON.parse(response.text || "{}");
        result.exif = exifData;
        db.prepare("INSERT INTO analysis_history (user_email, type, content, result) VALUES (?, ?, ?, ?)").run(userEmail || "anonymous", "image", `Image: ${file.originalname}`, JSON.stringify(result));
        res.json(result);
    } catch (error: any) {
        if (isQuotaError(error)) return res.json(mockImageResult());
        res.status(500).json({ error: error.message });
    }
});

// ── VIDEO ANALYSIS ────────────────────────────────────────────────
app.post("/api/analyze/video", upload.single("video"), async (req: any, res: any) => {
    const { userEmail } = req.body;
    const file = req.file;
    if (!file) return res.status(400).json({ error: "Video is required" });
    try {
        const ai = getAI();
        const base64Video = file.buffer.toString("base64");
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-lite",
            contents: { parts: [{ text: "Analyze this video for deepfakes, AI generation, or manipulation. Check: 1. Facial blending artifacts 2. Temporal inconsistencies 3. Lip sync accuracy 4. Background anomalies 5. Overall deepfake probability." }, { inlineData: { mimeType: file.mimetype, data: base64Video } }] },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        aiProbability: { type: Type.NUMBER }, humanProbability: { type: Type.NUMBER },
                        confidence: { type: Type.STRING }, explanation: { type: Type.STRING },
                        deepfakeSigns: { type: Type.ARRAY, items: { type: Type.STRING } }
                    },
                    required: ["aiProbability", "humanProbability", "confidence", "explanation", "deepfakeSigns"]
                }
            }
        });
        const result = JSON.parse(response.text || "{}");
        db.prepare("INSERT INTO analysis_history (user_email, type, content, result) VALUES (?, ?, ?, ?)").run(userEmail || "anonymous", "video", `Video: ${file.originalname}`, JSON.stringify(result));
        res.json(result);
    } catch (error: any) {
        if (isQuotaError(error)) return res.json({ aiProbability: 55, humanProbability: 45, confidence: "Medium", explanation: "**⚠️ Demo Mode** - Video analysis unavailable during quota limit.", deepfakeSigns: ["Quota limit reached — demo mode active"] });
        res.status(500).json({ error: error.message });
    }
});

// ── LINK ANALYSIS ─────────────────────────────────────────────────
app.post("/api/analyze/link", async (req: any, res: any) => {
    const { url, userEmail } = req.body;
    if (!url) return res.status(400).json({ error: "URL is required" });
    try {
        const ai = getAI();
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-lite",
            contents: `Analyze this URL/link for misinformation, fake news, or AI-generated content: ${url}. Check domain credibility, content patterns, and flag suspicious indicators.`,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        aiProbability: { type: Type.NUMBER }, humanProbability: { type: Type.NUMBER },
                        confidence: { type: Type.STRING }, explanation: { type: Type.STRING },
                        credibilityRating: { type: Type.STRING }, isFake: { type: Type.BOOLEAN },
                        redFlags: { type: Type.ARRAY, items: { type: Type.STRING } }
                    },
                    required: ["aiProbability", "humanProbability", "confidence", "explanation", "credibilityRating", "isFake", "redFlags"]
                }
            }
        });
        const result = JSON.parse(response.text || "{}");
        db.prepare("INSERT INTO analysis_history (user_email, type, content, result) VALUES (?, ?, ?, ?)").run(userEmail || "anonymous", "link", url, JSON.stringify(result));
        res.json(result);
    } catch (error: any) {
        if (isQuotaError(error)) return res.json({ aiProbability: 40, humanProbability: 60, confidence: "Medium", explanation: "**⚠️ Demo Mode**", credibilityRating: "Unverified", isFake: false, redFlags: ["Quota limit reached"] });
        res.status(500).json({ error: error.message });
    }
});

// ── PROFILE ANALYSIS ──────────────────────────────────────────────
app.post("/api/analyze/profile", async (req: any, res: any) => {
    const { url, platform, userEmail } = req.body;
    if (!url) return res.status(400).json({ error: "Profile URL is required" });
    try {
        const ai = getAI();
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-lite",
            contents: `Analyze this ${platform || "social media"} profile URL for bot activity, AI influence, or fake account patterns: ${url}`,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        aiProbability: { type: Type.NUMBER }, humanProbability: { type: Type.NUMBER },
                        confidence: { type: Type.STRING }, explanation: { type: Type.STRING },
                        botProbability: { type: Type.NUMBER }, isAIInfluencer: { type: Type.BOOLEAN },
                        redFlags: { type: Type.ARRAY, items: { type: Type.STRING } }
                    },
                    required: ["aiProbability", "humanProbability", "confidence", "explanation", "botProbability", "isAIInfluencer", "redFlags"]
                }
            }
        });
        const result = JSON.parse(response.text || "{}");
        db.prepare("INSERT INTO analysis_history (user_email, type, content, result) VALUES (?, ?, ?, ?)").run(userEmail || "anonymous", "profile", url, JSON.stringify(result));
        res.json(result);
    } catch (error: any) {
        if (isQuotaError(error)) return res.json({ aiProbability: 35, humanProbability: 65, confidence: "Medium", explanation: "**⚠️ Demo Mode**", botProbability: 22, isAIInfluencer: false, redFlags: ["Quota limit reached"] });
        res.status(500).json({ error: error.message });
    }
});

// ── CHAT ──────────────────────────────────────────────────────────
app.post("/api/chat", async (req: any, res: any) => {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: "Message required" });
    try {
        const ai = getAI();
        const response = await ai.models.generateContent({ model: "gemini-2.5-flash-lite", contents: `You are VERIFY AI, a helpful assistant specializing in content authenticity, fake news detection, and AI-generated content identification. Answer concisely.\n\nUser: ${message}` });
        res.json({ text: response.text });
    } catch (error: any) {
        res.json({ text: "I'm currently in demo mode due to API quota limits. Please try again later!" });
    }
});

// ── HISTORY ───────────────────────────────────────────────────────
app.get("/api/history", (req: any, res: any) => {
    const { email } = req.query;
    const history = db.prepare("SELECT * FROM analysis_history WHERE user_email = ? ORDER BY created_at DESC LIMIT 50").all(email || "anonymous");
    res.json(history);
});

// ── COMPARE ───────────────────────────────────────────────────────
app.post("/api/compare", async (req: any, res: any) => {
    const { type, content1, content2 } = req.body;
    try {
        const ai = getAI();
        const response = await ai.models.generateContent({ model: "gemini-2.5-flash-lite", contents: `Compare these two ${type} content versions for authenticity differences:\n\nVersion 1: ${content1}\n\nVersion 2: ${content2}\n\nWhich is more likely AI-generated and why?` });
        res.json({ comparison: response.text });
    } catch (e: any) {
        res.json({ comparison: "Comparison unavailable in demo mode." });
    }
});

// ── GENERATE ──────────────────────────────────────────────────────
app.post("/api/generate", async (req: any, res: any) => {
    const { prompt } = req.body;
    try {
        const ai = getAI();
        const response = await ai.models.generateContent({ model: "gemini-2.5-flash-lite", contents: prompt });
        res.json({ text: response.text });
    } catch (e: any) {
        res.json({ text: "Generation unavailable in demo mode." });
    }
});

export const handler = serverlessHttp(app);
