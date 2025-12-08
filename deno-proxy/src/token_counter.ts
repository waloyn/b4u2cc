import { ClaudeMessage, ClaudeRequest } from "./types.ts";
import { ProxyConfig } from "./config.ts";
import { logRequest } from "./logging.ts";
import { countTokensWithTiktoken } from "./tiktoken.ts";

export interface TokenCountResult {
  input_tokens: number;
  output_tokens?: number;
}

/**
 * 使用 tiktoken 进行精确的 token 估算
 */
export function estimateTokensFromText(text: string): number {
  try {
    return countTokensWithTiktoken(text);
  } catch (error) {
    // 如果 tiktoken 失败，回退到简单的字符估算
    return Math.ceil(text.length / 4);
  }
}

/**
 * 从 Claude 消息中提取所有文本内容
 */
export function extractTextFromMessages(messages: ClaudeMessage[]): string {
  return messages.map((message) => {
    if (typeof message.content === "string") {
      return message.content;
    }
    return message.content
      .map((block) => {
        if (block.type === "text") {
          return block.text;
        }
        if (block.type === "tool_use") {
          return `<invoke name="${block.name}">${JSON.stringify(block.input)}</invoke>`;
        }
        if (block.type === "tool_result") {
          return `<tool_result>${block.content}</tool_result>`;
        }
        return "";
      })
      .join("");
  }).join("\n");
}

/**
 * 使用本地 tiktoken 算法计算 token 数量
 */
export async function estimateTokensLocally(
  request: ClaudeRequest,
  config: ProxyConfig,
  requestId: string,
): Promise<TokenCountResult> {
  const allText = extractTextFromMessages(request.messages);
  let estimatedTokens = estimateTokensFromText(allText);

  // 添加系统提示的 token
  if (request.system) {
    const systemText = typeof request.system === "string" 
      ? request.system 
      : request.system.map(block => block.type === "text" ? block.text : "").join("");
    estimatedTokens += estimateTokensFromText(systemText);
  }

  // 应用 token 倍数
  const adjustedTokens = Math.ceil(estimatedTokens * config.tokenMultiplier);

  await logRequest(requestId, "debug", "Local token estimation with tiktoken", {
    textLength: allText.length,
    estimatedTokens,
    multiplier: config.tokenMultiplier,
    adjustedTokens,
  });

  return {
    input_tokens: adjustedTokens,
  };
}

/**
 * 主要的 token 计数函数，仅使用本地 tiktoken
 */
export async function countTokens(
  request: ClaudeRequest,
  config: ProxyConfig,
  requestId: string,
): Promise<TokenCountResult> {
  await logRequest(requestId, "debug", "Using local tiktoken for token counting", {
    model: request.model,
    messageCount: request.messages.length,
  });

  // 仅使用本地 tiktoken 计算
  return await estimateTokensLocally(request, config, requestId);
}

/**
 * 仅使用本地方法计算 token（不调用 Claude API）
 */
export async function countTokensLocally(
  request: ClaudeRequest,
  config: ProxyConfig,
  requestId: string,
): Promise<TokenCountResult> {
  return await estimateTokensLocally(request, config, requestId);
}