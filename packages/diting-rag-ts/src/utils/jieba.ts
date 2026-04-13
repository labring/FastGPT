// src/utils/jieba.ts
// jieba-wasm 中文分词工具（Node.js CJS 包，通过 createRequire 引入）

import { createRequire } from 'module';

const require = createRequire(import.meta.url);
// jieba-wasm Node.js 版本无需异步初始化，直接可用
const jieba = require('jieba-wasm') as {
  cut: (text: string, hmm: boolean) => string[];
  cut_for_search: (text: string, hmm: boolean) => string[];
};

/**
 * 对文本做 jieba 分词（精确模式），返回空格连接的 token 字符串
 * 与 FastGPT jiebaSplitWithCustomDict 的输出格式一致，供 MongoDB $text 搜索使用
 */
export function jiebaSplit(text: string): string {
  if (!text) return '';
  const tokens = jieba.cut(text, true); // hmm=true 启用 HMM 未登录词识别
  return tokens.filter((t) => t.trim().length > 0).join(' ');
}

/**
 * 搜索模式分词（更细粒度，适合全文检索召回）
 */
export function jiebaSplitForSearch(text: string): string {
  if (!text) return '';
  const tokens = jieba.cut_for_search(text, true);
  return tokens.filter((t) => t.trim().length > 0).join(' ');
}
