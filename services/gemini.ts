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
  private model: string = 'gemini-3-pro-preview';

  constructor(apiKey?: string) {
    // Priority: Argument -> LocalStorage -> Env Var
    const key = apiKey || localStorage.getItem('gemini_api_key') || process.env.API_KEY;
    const storedModel = localStorage.getItem('gemini_model');
    
    if (storedModel) {
      this.model = storedModel;
    }

    if (key) {
      try {
        this.ai = new GoogleGenAI({ apiKey: key });
      } catch (e) {
        console.error("Failed to initialize Gemini Client", e);
      }
    }
  }

  isConfigured(): boolean {
    return !!this.ai;
  }

  updateConfiguration(apiKey: string, model?: string) {
    if (apiKey) {
      localStorage.setItem('gemini_api_key', apiKey);
      this.ai = new GoogleGenAI({ apiKey });
    }
    if (model) {
      localStorage.setItem('gemini_model', model);
      this.model = model;
    }
  }

  async chat(message: string, context?: string, history: any[] = []): Promise<string> {
    if (!this.ai) return "AI is not configured. Please set your API Key in settings.";
    
    try {
      const chat = this.ai.chats.create({
        model: this.model, 
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
}