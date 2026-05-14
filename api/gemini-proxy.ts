import { GoogleGenAI } from "@google/genai";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST requests
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;

  if (!apiKey) {
    console.error("Gemini API Error: GEMINI_API_KEY is not configured.");
    return res.status(500).json({ error: "GEMINI_API_KEY is not configured on the server." });
  }

  try {
    const { prompt, systemInstruction, config } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    const genAI = new GoogleGenAI({ apiKey: apiKey.trim() });
    const response = await genAI.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        systemInstruction: systemInstruction,
        ...config
      },
    });

    const text = response.text;

    return res.json({ model: "gemini-3-flash-preview", text });
  } catch (error: any) {
    console.error("Gemini API Proxy Error:", error);
    return res.status(500).json({ 
      error: error.message || "An error occurred during content generation",
      details: error.status ? `Status: ${error.status}` : undefined
    });
  }
}
