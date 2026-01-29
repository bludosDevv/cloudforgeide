import { GoogleGenAI } from "@google/genai";
import { SYSTEM_INSTRUCTION } from '../constants';

const STRUCTURED_OUTPUT_INSTRUCTION = `
You are a Minecraft Modding IDE Agent. You have full access to read and modify the project files.

### CRITICAL RULES FOR FILE OPERATIONS:
1. When the user asks to CREATE, UPDATE, DELETE, or MODIFY files (e.g., "create an Item class", "fix the bug", "add a dependency"), you **MUST** return a JSON object containing the code changes.
2. **DO NOT** just say "I have updated the files" without providing the JSON. If you do not provide the JSON, the files will NOT change.
3. **DO NOT** use Markdown code blocks for the JSON. Just return the raw JSON object if possible, or wrap it in \`\`\`json ... \`\`\`.

### JSON FORMAT:
You must return a single JSON object with this structure:
\`\`\`json
{
  "text": "Brief explanation of what you did (e.g., 'I created the ItemInit class').",
  "actions": [
    { "type": "create", "path": "src/main/java/com/example/mod/ItemInit.java", "content": "package com..." },
    { "type": "update", "path": "src/main/resources/assets/modid/lang/en_us.json", "content": "{...}" }
  ]
}
\`\`\`

### RULES:
- If you are just answering a question (e.g., "How do I add a block?"), reply with normal text/markdown.
- If you are WRITING CODE, assume the user wants you to apply it. Use the JSON format.
- Always use full paths (e.g., src/main/java/...).
`;

export class GeminiService {
  private ai: GoogleGenAI | null = null;
  // Default to Flash for speed and higher rate limits
  private model: string = 'gemini-3-flash-preview';

  constructor(apiKey?: string) {
    this.initialize(apiKey);
  }

  initialize(explicitKey?: string) {
    // 1. Explicit Argument
    // 2. Local Storage (User preference)
    // 3. Environment Variable (Vercel secret)
    let key = explicitKey;
    if (!key && typeof window !== 'undefined') {
        key = localStorage.getItem('gemini_api_key') || undefined;
    }
    if (!key && typeof process !== 'undefined' && process.env.API_KEY) {
        key = process.env.API_KEY;
    }

    // Load Model Preference
    if (typeof window !== 'undefined') {
        const storedModel = localStorage.getItem('gemini_model');
        if (storedModel) this.model = storedModel;
    }

    if (key) {
      try {
        this.ai = new GoogleGenAI({ apiKey: key });
      } catch (e) {
        console.error("Failed to initialize Gemini Client", e);
        this.ai = null;
      }
    } else {
        this.ai = null;
    }
  }

  isConfigured(): boolean {
    return !!this.ai;
  }

  updateConfiguration(apiKey: string, model?: string) {
    if (apiKey) {
      if (typeof window !== 'undefined') localStorage.setItem('gemini_api_key', apiKey);
      this.initialize(apiKey);
    }
    if (model) {
      if (typeof window !== 'undefined') localStorage.setItem('gemini_model', model);
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
      
      // Handle Quota Exceeded (429) specifically
      if (error.message?.includes('429') || error.status === 429 || error.message?.includes('quota')) {
          return `⚠️ **Quota Exceeded**: Your API key has hit its rate limit for the **${this.model}** model. \n\nPlease switch to **Gemini 3.0 Flash** in settings (it has higher limits) or wait a minute before trying again.`;
      }

      return `Error communicating with AI agent: ${error.message}`;
    }
  }
}