export interface BidDocument {
  id: string;
  title: string;
  content: string;
  uploadDate: string;
  fileType: string;
  libraryType: 'spec' | 'basic';
}

export interface BidDraft {
  id: string;
  title: string;
  sections: { title: string; content: string; prompt: string; reasoning?: string }[];
  lastModified: string;
}

export interface LLMConfig {
  provider: "qwen" | "doubao" | "deepseek";
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export interface AppSettings {
  activeConfig: LLMConfig;
  configs: LLMConfig[];
}
