import { GoogleGenAI } from "@google/genai";
import { SYSTEM_INSTRUCTION } from '../constants';

const STRUCTURED_OUTPUT_INSTRUCTION = `
You are a powerful Minecraft Modding Assistant.
You can read files, write code, and also PERFORM ACTIONS on the project structure.

When you want to Modify, Create, or Delete files, you MUST return a JSON object in the following format inside a code block labeled 'json':

\`\`\`json
{
  "text": "I have created the files for you...",
  "actions": [
    { "type": "create", "path": "src/main/java/com/example/Test.java", "content": "package com.example..." },
    { "type": "update", "path": "build.gradle", "content": "..." },
    { "type": "delete", "path": "old_file.txt" }
  ]
}
\`\`\`

If you are just chatting or explaining code without applying changes, just reply normally with text.
Support Markdown for bold text (**text**) and code blocks (\`\`\`java ... \`\`\`).
`;

export class GeminiService {
  private ai: GoogleGenAI | null = null;

  constructor() {
    try {
      const apiKey = process.env.API_KEY;
      if (apiKey) {
        this.ai = new GoogleGenAI({ apiKey });
      } else {
        console.warn("Gemini API Key is missing. AI features will be disabled.");
      }
    } catch (e) {
      console.error("Failed to initialize Gemini Client", e);
    }
  }

  async chat(message: string, context?: string, history: any[] = []): Promise<string> {
    if (!this.ai) return "AI is not configured (Missing API Key).";
    
    try {
      const chat = this.ai.chats.create({
        model: "gemini-3-pro-preview", 
        config: {
          systemInstruction: SYSTEM_INSTRUCTION + "\n" + STRUCTURED_OUTPUT_INSTRUCTION + (context ? `\n\nCurrent Project Context:\n${context}` : ""),
        },
        history: history
      });

      const response = await chat.sendMessage({
          message
      });
      
      return response.text || "I couldn't generate a response.";
    } catch (error: any) {
      console.error("Gemini Error:", error);
      return `Error communicating with AI agent: ${error.message}`;
    }
  }

  async generateCode(prompt: string, fileContent: string): Promise<string> {
      if (!this.ai) return "";
      try {
        const response = await this.ai.models.generateContent({
          model: "gemini-3-pro-preview",
          contents: `Here is the current file content:\n\`\`\`\n${fileContent}\n\`\`\`\n\nRequest: ${prompt}\n\nProvide the full updated file content directly. Do not use markdown code blocks, just raw text.`,
        });
        return response.text || "";
      } catch (e) {
        console.error("Gemini Generate Error", e);
        return "";
      }
  }
}