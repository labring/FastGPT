// src/utils/json_parser.ts
// LLM JSON 解析容错 - 对齐 Python parse_llm_json 6 级降级策略

import { getLogger } from './logger';

/**
 * 从 LLM 响应中解析 JSON，6 级降级策略
 *
 * 策略优先级：
 * 1. 直接 JSON.parse
 * 2. 预处理（去 BOM、markdown 围栏、提取外层 {...}）
 * 3. 修复 JSON 字符串（真换行→\\n、尾逗号、Python True/False/None）
 * 4. 括号计数提取嵌套 JSON 对象
 * 5. 正则提取 ```json ``` 代码块
 * 6. 宽松模式 — 任何可解析 dict
 */
export function parseJSON<T = unknown>(text: string): T | null {
  if (!text || !text.trim()) {
    return null;
  }

  const original = text;

  // --- 策略 1: 直接解析 ---
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as T;
    }
  } catch {
    // continue
  }

  // --- 策略 2: 预处理后解析 ---
  const preprocessed = preprocess(text);
  try {
    const parsed = JSON.parse(preprocessed);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as T;
    }
  } catch {
    // continue
  }

  // --- 策略 3: 修复 JSON 字符串后解析 ---
  const fixed = fixJSONString(preprocessed);
  try {
    const parsed = JSON.parse(fixed);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as T;
    }
  } catch {
    // continue
  }

  // --- 策略 4: 括号计数提取嵌套 JSON 对象 ---
  const extracted = extractJSONObject(original);
  if (extracted) {
    for (const variant of [extracted, fixJSONString(extracted)]) {
      try {
        const parsed = JSON.parse(variant);
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
          return parsed as T;
        }
      } catch {
        continue;
      }
    }
  }

  // --- 策略 5: 正则提取 ```json ``` 代码块 ---
  for (const pattern of [/```(?:json|JSON)\s*([\s\S]*?)\s*```/g, /```\s*([\s\S]*?)\s*```/g]) {
    const match = pattern.exec(original);
    if (match) {
      const block = match[1].trim();
      for (const variant of [block, fixJSONString(block)]) {
        try {
          const parsed = JSON.parse(variant);
          if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
            return parsed as T;
          }
        } catch {
          continue;
        }
      }
    }
  }

  // --- 策略 6: 宽松模式 — 任何可解析 dict ---
  for (const variantText of [original, preprocessed, fixed]) {
    const obj = extractJSONObject(variantText);
    if (obj) {
      const objFixed = fixJSONString(obj);
      try {
        const parsed = JSON.parse(objFixed);
        if (typeof parsed === 'object' && parsed !== null) {
          return parsed as T;
        }
      } catch {
        continue;
      }
    }
  }

  // 全部失败
  getLogger()?.warn(
    `[parseJSON] Failed to parse LLM response as JSON (all strategies exhausted): ${original.slice(0, 500)}`
  );
  return null;
}

// ============================================================
// 内部工具函数
// ============================================================

/**
 * 预处理：去 BOM、markdown 围栏、提取外层 {...}
 */
function preprocess(text: string): string {
  // 去 BOM
  text = text.replace(/^\uFEFF/, '');
  text = text.trim();

  // 去 markdown 围栏
  if (text.startsWith('```')) {
    const lines = text.split('\n');
    // 去掉首行 ```json 和末行 ```
    if (lines[0]?.trim().startsWith('```')) {
      lines.shift();
    }
    if (lines.length > 0 && lines[lines.length - 1]?.trim() === '```') {
      lines.pop();
    }
    text = lines.join('\n').trim();
  }

  // 提取外层 {...}（去掉前后多余文本）
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    text = text.slice(firstBrace, lastBrace + 1);
  }

  return text;
}

/**
 * 修复 JSON 字符串中的常见错误
 */
function fixJSONString(text: string): string {
  // 1. 将字符串值内的真实换行符替换为 \\n
  try {
    const result: string[] = [];
    let inString = false;
    let i = 0;

    while (i < text.length) {
      const char = text[i];

      if (!inString) {
        if (char === '"') {
          inString = true;
        }
        result.push(char);
      } else {
        if (char === '\\' && i + 1 < text.length) {
          result.push(char);
          i++;
          if (i < text.length) {
            result.push(text[i]);
          }
        } else if (char === '"') {
          inString = false;
          result.push(char);
        } else if (char === '\n') {
          result.push('\\n');
        } else if (char === '\r') {
          result.push('\\r');
        } else if (char === '\t') {
          result.push('\\t');
        } else if (char.charCodeAt(0) < 32) {
          result.push(' ');
        } else {
          result.push(char);
        }
      }

      i++;
    }

    text = result.join('');
  } catch {
    // ignore
  }

  // 2. 移除尾随逗号
  text = text.replace(/,\s*([}\]])/g, '$1');

  // 3. 修复 Python 风格布尔值和 None
  text = text.replace(/\bTrue\b/g, 'true');
  text = text.replace(/\bFalse\b/g, 'false');
  text = text.replace(/\bNone\b/g, 'null');

  return text;
}

/**
 * 用括号计数法从文本中提取完整的 JSON 对象
 */
function extractJSONObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = start; i < text.length; i++) {
    const char = text[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\') {
      if (inString) {
        escapeNext = true;
      }
      continue;
    }

    if (char === '"' && !escapeNext) {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === '{') {
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  // 没有找到匹配的 }，返回从 { 到最后一个 } 的内容
  const lastBrace = text.lastIndexOf('}');
  if (lastBrace > start) {
    return text.slice(start, lastBrace + 1);
  }

  return null;
}

/**
 * 安全解析 JSON，带默认值
 */
export function safeParseJSON<T>(text: string, defaultValue: T): T {
  return parseJSON<T>(text) ?? defaultValue;
}

/**
 * 从 LLM 响应中提取工具调用
 */
export function parseToolCall(
  text: string
): { tool: string; args: Record<string, unknown> } | null {
  const parsed = parseJSON<{
    tool?: string;
    action?: string;
    name?: string;
    args?: Record<string, unknown>;
  }>(text);
  if (!parsed) return null;

  const toolName = parsed.tool || parsed.action || parsed.name;
  if (!toolName || !parsed.args) return null;

  return { tool: toolName, args: parsed.args };
}
