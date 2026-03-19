import OpenAI from "openai";
import { BidDocument, LLMConfig } from "../types";

async function callLLMStream(
  prompt: string, 
  config: LLMConfig, 
  onChunk: (data: { content?: string; reasoning?: string; done?: boolean }) => void
) {
  if (!config.apiKey) throw new Error("API Key is required");

  const openai = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl || (
      config.provider === "qwen" ? "https://dashscope.aliyuncs.com/compatible-mode/v1" :
      config.provider === "doubao" ? "https://ark.cn-beijing.volces.com/api/v3" :
      config.provider === "deepseek" ? "https://api.deepseek.com" : undefined
    ),
    dangerouslyAllowBrowser: true,
  });

  try {
    const stream = await openai.chat.completions.create({
      model: config.model,
      messages: [{ role: "user", content: prompt }],
      stream: true,
    });

    let fullContent = "";
    let fullReasoning = "";

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;

      const content = delta.content || "";
      const reasoning = (delta as any).reasoning_content || "";

      if (content) fullContent += content;
      if (reasoning) fullReasoning += reasoning;

      onChunk({ content: fullContent, reasoning: fullReasoning });
    }

    onChunk({ content: fullContent, reasoning: fullReasoning, done: true });
    return { content: fullContent, reasoning: fullReasoning };
  } catch (error) {
    console.error("LLM Stream Error:", error);
    throw error;
  }
}

export async function searchKnowledgeBase(
  query: string, 
  documents: BidDocument[], 
  config: LLMConfig,
  onChunk?: (data: { content?: string; reasoning?: string; done?: boolean }) => void
) {
  // Simple RAG-lite: Filter documents that contain the query terms or are highly relevant
  const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 1);
  
  const relevantDocs = documents.filter(doc => {
    const content = doc.content.toLowerCase();
    return queryTerms.some(term => content.includes(term)) || content.includes(query.toLowerCase());
  }).slice(0, 5); // Limit to top 5 relevant docs to save tokens

  const context = relevantDocs.map(doc => {
    // If doc is too large, take snippets around the query
    if (doc.content.length > 10000) {
      const index = doc.content.toLowerCase().indexOf(query.toLowerCase());
      const start = Math.max(0, index - 2000);
      const end = Math.min(doc.content.length, index + 5000);
      return `[文档: ${doc.title} (片段)]\n...${doc.content.substring(start, end)}...`;
    }
    return `[文档: ${doc.title}]\n内容: ${doc.content}`;
  }).join("\n\n---\n\n");
  
  const prompt = `
    你是一个专业的标书专家。你的任务是从提供的招标文件知识库和公司基本信息库中检索与用户查询最相关的信息。
    
    重要要求：
    1. 请以结构化的方式返回相关条款、技术要求或过往响应方案。
    2. 逻辑清晰，分点展示（使用 Markdown 列表）。
    3. 在回答时，必须明确指出信息来源于哪个文档，使用 "[来源: 文档名称 | 引用片段]" 的格式。如果无法定位具体片段，请仅使用 "[来源: 文档名称]"。
    4. 引用片段必须是原文中的一小段话（约20-50字），以便用户溯源。
    5. 如果提供的上下文不足以回答，请如实告知，并根据你的专业知识给出一般性建议。

    参考上下文：
    ${context || "未找到直接相关的文档内容。"}

    用户查询：
    ${query}

    请根据以上参考信息，为用户提供最相关的参考信息并标注来源。
  `;

  if (onChunk) {
    return await callLLMStream(prompt, config, onChunk);
  } else {
    // Fallback to non-stream if no callback
    const openai = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl || (
        config.provider === "qwen" ? "https://dashscope.aliyuncs.com/compatible-mode/v1" :
        config.provider === "doubao" ? "https://ark.cn-beijing.volces.com/api/v3" :
        config.provider === "deepseek" ? "https://api.deepseek.com" : undefined
      ),
      dangerouslyAllowBrowser: true,
    });

    const response = await openai.chat.completions.create({
      model: config.model,
      messages: [{ role: "user", content: prompt }],
    });

    const message = response.choices[0].message;
    return {
      content: message.content || "",
      reasoning: (message as any).reasoning_content || null
    };
  }
}

export async function generateBidSection(
  sectionTitle: string, 
  userPrompt: string, 
  currentContent: string, 
  documents: BidDocument[], 
  config: LLMConfig,
  onChunk?: (data: { content?: string; reasoning?: string; done?: boolean }) => void
) {
  // Filter relevant documents for generation
  const queryTerms = (sectionTitle + " " + userPrompt).toLowerCase().split(/\s+/).filter(t => t.length > 1);
  
  const relevantDocs = documents.filter(doc => {
    const content = doc.content.toLowerCase();
    return queryTerms.some(term => content.includes(term));
  }).slice(0, 8); // Limit context size

  const context = relevantDocs.map(doc => {
    if (doc.content.length > 8000) {
      // Try to find relevant parts
      const firstTerm = queryTerms.find(t => doc.content.toLowerCase().includes(t));
      const index = firstTerm ? doc.content.toLowerCase().indexOf(firstTerm) : 0;
      const start = Math.max(0, index - 1000);
      const end = Math.min(doc.content.length, index + 4000);
      return `[参考文档: ${doc.title} (相关片段)]\n...${doc.content.substring(start, end)}...`;
    }
    return `[参考文档: ${doc.title}]\n内容: ${doc.content}`;
  }).join("\n\n---\n\n");

  const prompt = `
    你是一个专业的标书撰写专家。请根据提供的上下文、技术规范库和公司基本信息库内容，为用户撰写或迭代标书的特定章节。
    
    要求：
    1. 确保语言专业、严谨，符合招投标规范。
    2. 在撰写过程中，如果引用了库中的具体条款或案例，请在每段落后另起一行注明参考来源，格式为 "[来源: 文档名称 | 引用片段]"。
    3. 引用片段必须是原文中的一小段话（约20-50字），以便用户溯源。
    4. 如果当前已有内容，请根据用户的提示词进行迭代、修改或继续生成后续内容。

    参考背景知识：
    ${context || "暂无直接相关的背景参考。"}

    当前章节标题：${sectionTitle}
    当前已有内容：
    ${currentContent || "暂无内容"}

    用户的提示词/指令：
    ${userPrompt}

    请根据以上信息，生成或更新章节内容。
  `;

  if (onChunk) {
    return await callLLMStream(prompt, config, onChunk);
  } else {
    // Fallback to non-stream
    const openai = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl || (
        config.provider === "qwen" ? "https://dashscope.aliyuncs.com/compatible-mode/v1" :
        config.provider === "doubao" ? "https://ark.cn-beijing.volces.com/api/v3" :
        config.provider === "deepseek" ? "https://api.deepseek.com" : undefined
      ),
      dangerouslyAllowBrowser: true,
    });

    const response = await openai.chat.completions.create({
      model: config.model,
      messages: [{ role: "user", content: prompt }],
    });

    const message = response.choices[0].message;
    return {
      content: message.content || "",
      reasoning: (message as any).reasoning_content || null
    };
  }
}
