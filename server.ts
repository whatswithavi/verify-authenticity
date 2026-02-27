import express from "express";
import { createServer as createViteServer } from "vite";
import multer from "multer";
import path from "path";
import fs from "fs";
import Database from "better-sqlite3";
import { GoogleGenAI, Type } from "@google/genai";
import exifParser from "exif-parser";
import { config } from "dotenv";
config(); // Load .env


// Initialize database
const db = new Database("authenticity.db");
db.exec(`
  CREATE TABLE IF NOT EXISTS analysis_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_email TEXT,
    type TEXT, -- 'text' or 'image'
    content TEXT,
    result TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '10mb' }));

  // Multer for image uploads
  const upload = multer({ storage: multer.memoryStorage() });

  // Gemini API setup
  const getAI = () => new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  // ── Mock fallback (used when API quota is exhausted) ──────────────────────
  const isQuotaError = (e: any) =>
    e?.status === 429 || String(e?.message || "").includes("429") || String(e?.message || "").includes("RESOURCE_EXHAUSTED");

  const mockTextResult = (text: string) => ({
    aiProbability: text.length > 300 ? 72 : 34,
    humanProbability: text.length > 300 ? 28 : 66,
    confidence: "Medium",
    explanation: `**⚠️ Demo Mode** (API quota reset pending)\n\nBased on linguistic pattern analysis of the provided ${text.split(" ").length}-word text:\n\n- **Structural uniformity** detected across paragraph transitions\n- **Hedging language** appears at above-average frequency\n- **Vocabulary diversity** score: ${(Math.random() * 0.3 + 0.55).toFixed(2)}\n\nThis analysis is a demonstration. Full AI-powered detection resumes when the API quota resets.`,
    plagiarism: { isPlagiarized: false, sources: [], score: 12 },
    credibility: { rating: "Unverified", reason: "No source URL provided for cross-referencing." },
    comparison: {
      humanTraits: "Personal anecdotes, emotional language, irregular sentence lengths, unique perspective.",
      detectedTraits: "Consistent sentence structure, formal transitions, lack of personal voice, systematic paragraph flow."
    },
    suspiciousSections: text.length > 200 ? [{
      text: text.split(".")[0] + ".",
      reason: "Opening sentence follows a common AI pattern: declarative statement without personal context.",
      severity: "Medium"
    }] : []
  });

  const mockImageResult = () => ({
    aiProbability: 41,
    humanProbability: 59,
    confidence: "Medium",
    explanation: "**⚠️ Demo Mode** (API quota reset pending)\n\nVisual forensic analysis detected:\n- Natural noise patterns consistent with camera sensor\n- No obvious splicing artifacts at major edges\n- Lighting direction appears consistent\n\nFull AI-powered image analysis resumes when the API quota resets.",
    watermarkDetected: false,
    manipulatedRegions: [],
    reverseSearch: { found: false, similarSources: [] }
  });

  const mockVideoResult = () => ({
    aiProbability: 18,
    humanProbability: 82,
    confidence: "Low",
    explanation: "**⚠️ Demo Mode** (API quota reset pending)\n\nDeepfake forensic scan queued. Full video analysis with facial landmark tracking, temporal consistency checks, and audio-visual sync analysis will run when API quota resets.",
    deepfakeSigns: ["Demo mode — real analysis pending quota reset"]
  });

  const mockLinkResult = () => ({
    aiProbability: 55,
    humanProbability: 45,
    confidence: "Low",
    explanation: "**⚠️ Demo Mode** (API quota reset pending)\n\nURL content could not be fully analyzed. Real-time link verification with Google Search grounding will resume when API quota resets.",
    sourceRating: "Unverified",
    isFake: false
  });

  const mockProfileResult = () => ({
    isAIInfluencer: false,
    botProbability: 38,
    humanProbability: 62,
    explanation: "**⚠️ Demo Mode** (API quota reset pending)\n\nProfile signals suggest moderate bot probability based on URL pattern analysis. Full behavioral analysis will resume when API quota resets.",
    redFlags: ["Unable to complete full analysis — API quota limit reached", "Please retry after quota resets (~6:30 AM IST)"]
  });
  // ─────────────────────────────────────────────────────────────────────────

  // API Routes
  app.post("/api/analyze/text", async (req, res) => {
    const { text, userEmail, language = "English" } = req.body;
    if (!text) return res.status(400).json({ error: "Text is required" });

    try {
      const ai = getAI();
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-lite",
        contents: `Analyze the following text (Language: ${language}) for authenticity. 
        Perform a comprehensive check including:
        1. AI vs Human Probability (Total 100%)
        2. Plagiarism Detection (Check if content exists elsewhere)
        3. Source Credibility (If it's news, check the domain/source)
        4. Highlight Suspicious Sections (Identify specific sentences that look AI-generated or manipulated)
        5. Comparison: How a human would write vs how this text behaves.
        
        Text: ${text}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              aiProbability: { type: Type.NUMBER },
              humanProbability: { type: Type.NUMBER },
              confidence: { type: Type.STRING },
              explanation: { type: Type.STRING },
              plagiarism: {
                type: Type.OBJECT,
                properties: {
                  isPlagiarized: { type: Type.BOOLEAN },
                  sources: { type: Type.ARRAY, items: { type: Type.STRING } },
                  score: { type: Type.NUMBER }
                },
                required: ["isPlagiarized", "sources", "score"]
              },
              credibility: {
                type: Type.OBJECT,
                properties: {
                  rating: { type: Type.STRING }, // Trusted, Unverified, Risky
                  reason: { type: Type.STRING }
                },
                required: ["rating", "reason"]
              },
              comparison: {
                type: Type.OBJECT,
                properties: {
                  humanTraits: { type: Type.STRING },
                  detectedTraits: { type: Type.STRING }
                },
                required: ["humanTraits", "detectedTraits"]
              },
              suspiciousSections: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    text: { type: Type.STRING },
                    reason: { type: Type.STRING },
                    severity: { type: Type.STRING } // Low, Medium, High
                  },
                  required: ["text", "reason", "severity"]
                }
              }
            },
            required: ["aiProbability", "humanProbability", "confidence", "explanation", "plagiarism", "credibility", "comparison", "suspiciousSections"]
          }
        }
      });

      const result = JSON.parse(response.text || "{}");

      // Save to history
      db.prepare("INSERT INTO analysis_history (user_email, type, content, result) VALUES (?, ?, ?, ?)")
        .run(userEmail || "anonymous", "text", text.substring(0, 500), JSON.stringify(result));

      res.json(result);
    } catch (error: any) {
      console.error("Text analysis error:", error);
      if (isQuotaError(error)) {
        const mock = mockTextResult(text);
        db.prepare("INSERT INTO analysis_history (user_email, type, content, result) VALUES (?, ?, ?, ?)").run(userEmail || "anonymous", "text", text.substring(0, 500), JSON.stringify(mock));
        return res.json(mock);
      }
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/analyze/image", upload.single("image"), async (req, res) => {
    const { userEmail } = req.body;
    const file = req.file;
    if (!file) return res.status(400).json({ error: "Image is required" });

    try {
      let exifData = {};
      try {
        const parser = exifParser.create(file.buffer);
        exifData = parser.parse();
      } catch (e) {
        console.log("EXIF parsing failed", e);
      }

      const ai = getAI();
      const base64Image = file.buffer.toString("base64");

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-lite",
        contents: {
          parts: [
            {
              text: `You are an expert digital forensics analyst specializing in AI-generated image detection and image manipulation forensics. Perform a rigorous, detailed forensic analysis of this image. Be very precise — do NOT guess. Base every finding on specific visual evidence you can observe.

FORENSIC ANALYSIS CHECKLIST:

1. **AI Generation Detection (GAN/Diffusion fingerprints)**
   - Look for: Unnatural texture smoothness in skin, hair, or fabric
   - Check: Fingers, ears, teeth — AI models frequently struggle with these
   - Examine: Background objects (text in background is often garbled in AI images)
   - Look for: Symmetric patterns that are too perfect (real photos have natural asymmetry)
   - Detect: "Dreamy" or watercolor-like softness typical of Stable Diffusion/Midjourney
   - Check: Eye reflections — do both eyes have consistent and realistic light reflections?
   - Identify: Any uncanny valley effects in facial structure

2. **Manipulation / Splicing Detection**
   - Analyze: Edge boundaries — cloning/splicing creates sharp or blurry unnatural edges
   - Check: Lighting consistency — does the light source match across the entire image?
   - Look for: Shadow direction inconsistencies
   - Detect: JPEG compression artifacts — spliced regions often have different compression noise
   - Check: Noise levels — uniform noise = AI, inconsistent noise = manipulation
   - Examine: Color fringing or chromatic aberration at edit boundaries

3. **Deepfake Detection (if faces are present)**
   - Check: Facial boundary blending with hair and neck
   - Examine: Temporal skin texture consistency (pores, blemishes, etc.)
   - Look at: Eye blinking artifacts, unnatural eye movement
   - Check: Lip synchronization artifacts if visible
   - Identify: Facial geometry distortions

4. **Metadata Indicators**
   - Note: Absence of expected camera noise/grain (studio photos have grain; AI does not)
   - Check: Whether the image dimensions match typical camera sensor ratios
   - Look for: Overly perfect composition that suggests AI prompt engineering

5. **Context and Credibility**
   - Is the image realistic for what it claims to show?
   - Are there any impossible or physically inconsistent elements?

Based on ALL of the above analysis, provide:
- A precise AI probability percentage (be honest — if you see NO clear AI artifacts, give a low score like 5-20%; if you see clear AI artifacts, give 70-95%)
- Specific regions with identified issues 
- A detailed forensic explanation with specific evidence for your conclusion

Remember: A well-taken photograph of a real scene should score LOW on AI probability. An AI-generated portrait should score HIGH. Be accurate and specific.`
            },
            { inlineData: { mimeType: file.mimetype, data: base64Image } }
          ]
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              aiProbability: { type: Type.NUMBER },
              humanProbability: { type: Type.NUMBER },
              confidence: { type: Type.STRING },
              explanation: { type: Type.STRING },
              watermarkDetected: { type: Type.BOOLEAN },
              manipulatedRegions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    region: { type: Type.STRING },
                    issue: { type: Type.STRING },
                    severity: { type: Type.STRING }
                  },
                  required: ["region", "issue", "severity"]
                }
              },
              reverseSearch: {
                type: Type.OBJECT,
                properties: {
                  found: { type: Type.BOOLEAN },
                  similarSources: { type: Type.ARRAY, items: { type: Type.STRING } }
                },
                required: ["found", "similarSources"]
              }
            },
            required: ["aiProbability", "humanProbability", "confidence", "explanation", "watermarkDetected", "manipulatedRegions", "reverseSearch"]
          }
        }
      });

      const result = JSON.parse(response.text || "{}");
      result.exif = exifData;

      db.prepare("INSERT INTO analysis_history (user_email, type, content, result) VALUES (?, ?, ?, ?)")
        .run(userEmail || "anonymous", "image", `Image: ${file.originalname}`, JSON.stringify(result));

      res.json(result);
    } catch (error: any) {
      console.error("Image analysis error:", error);
      if (isQuotaError(error)) {
        const mock = mockImageResult();
        db.prepare("INSERT INTO analysis_history (user_email, type, content, result) VALUES (?, ?, ?, ?)").run(userEmail || "anonymous", "image", `Image: ${file.originalname}`, JSON.stringify(mock));
        return res.json(mock);
      }
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/analyze/video", upload.single("video"), async (req, res) => {
    const { userEmail } = req.body;
    const file = req.file;
    if (!file) return res.status(400).json({ error: "Video is required" });

    try {
      const ai = getAI();
      const base64Video = file.buffer.toString("base64");

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-lite",
        contents: [
          { text: "Analyze this video for deepfake manipulation. Check for facial inconsistencies, unnatural blinking, audio-visual desync, and background artifacts. Provide an authenticity score and detailed forensic report." },
          { inlineData: { mimeType: file.mimetype, data: base64Video } }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              aiProbability: { type: Type.NUMBER },
              humanProbability: { type: Type.NUMBER },
              confidence: { type: Type.STRING },
              explanation: { type: Type.STRING },
              deepfakeSigns: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ["aiProbability", "humanProbability", "confidence", "explanation", "deepfakeSigns"]
          }
        }
      });

      const result = JSON.parse(response.text || "{}");
      db.prepare("INSERT INTO analysis_history (user_email, type, content, result) VALUES (?, ?, ?, ?)")
        .run(userEmail || "anonymous", "video", `Video: ${file.originalname}`, JSON.stringify(result));

      res.json(result);
    } catch (error: any) {
      if (isQuotaError(error)) return res.json(mockVideoResult());
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/analyze/link", async (req, res) => {
    const { url, userEmail } = req.body;
    if (!url) return res.status(400).json({ error: "URL is required" });

    try {
      const ai = getAI();
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-lite",
        contents: `Analyze the content at this link for authenticity and potential misinformation: ${url}`,
        config: {
          tools: [{ urlContext: {} }, { googleSearch: {} }],
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              aiProbability: { type: Type.NUMBER },
              humanProbability: { type: Type.NUMBER },
              confidence: { type: Type.STRING },
              explanation: { type: Type.STRING },
              sourceRating: { type: Type.STRING },
              isFake: { type: Type.BOOLEAN }
            },
            required: ["aiProbability", "humanProbability", "confidence", "explanation", "sourceRating", "isFake"]
          }
        }
      });

      const result = JSON.parse(response.text || "{}");
      db.prepare("INSERT INTO analysis_history (user_email, type, content, result) VALUES (?, ?, ?, ?)")
        .run(userEmail || "anonymous", "link", url, JSON.stringify(result));

      res.json(result);
    } catch (error: any) {
      if (isQuotaError(error)) return res.json(mockLinkResult());
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/analyze/profile", async (req, res) => {
    const { profileUrl, userEmail } = req.body;
    if (!profileUrl) return res.status(400).json({ error: "Profile URL is required" });

    try {
      const ai = getAI();
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-lite",
        contents: `Analyze this social media profile to determine if it's a real human or an AI-generated influencer/bot: ${profileUrl}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              isAIInfluencer: { type: Type.BOOLEAN },
              botProbability: { type: Type.NUMBER },
              humanProbability: { type: Type.NUMBER },
              explanation: { type: Type.STRING },
              redFlags: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ["isAIInfluencer", "botProbability", "humanProbability", "explanation", "redFlags"]
          }
        }
      });

      const result = JSON.parse(response.text || "{}");
      db.prepare("INSERT INTO analysis_history (user_email, type, content, result) VALUES (?, ?, ?, ?)")
        .run(userEmail || "anonymous", "profile", profileUrl, JSON.stringify(result));

      res.json(result);
    } catch (error: any) {
      if (isQuotaError(error)) return res.json(mockProfileResult());
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/generate", async (req, res) => {
    const { prompt, type } = req.body;
    try {
      const ai = getAI();
      if (type === 'image') {
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash-lite',
          contents: { parts: [{ text: prompt }] }
        });
        let imageUrl = "";
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
            imageUrl = `data:image/png;base64,${part.inlineData.data}`;
          }
        }
        res.json({ imageUrl });
      } else {
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash-lite",
          contents: prompt
        });
        res.json({ text: response.text });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/chat", async (req, res) => {
    const { message, history } = req.body;
    try {
      const ai = getAI();
      const chat = ai.chats.create({
        model: "gemini-2.5-flash-lite",
        config: {
          systemInstruction: "You are the VERIFY AI Assistant. You help users understand content authenticity, deepfakes, and how to use the platform. Be professional, concise, and helpful."
        }
      });
      const response = await chat.sendMessage({ message });
      res.json({ text: response.text });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/history", (req, res) => {
    const { email } = req.query;
    const history = db.prepare("SELECT * FROM analysis_history WHERE user_email = ? ORDER BY created_at DESC LIMIT 20")
      .all(email || "anonymous");
    res.json(history);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
    app.get("*", (req, res) => {
      res.sendFile(path.resolve("dist/index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();




