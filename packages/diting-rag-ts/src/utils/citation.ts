// src/utils/citation.ts
// 引用处理工具

import type { ChunkItem } from '../types/chunk';

/**
 * 从 chunk 内容中提取引用信息
 */
export interface CitationInfo {
  sourceName: string;
  chunkId: string;
  score: number;
}

// 短索引格式: [id-1], [id-2], [id-3]...
const SHORT_INDEX_PATTERN = /\[id-(\d+)\]/g;

// 完整 ID 格式: [id-xxx] (xxx 是 chunk ID)
const LEGACY_CITE_PATTERN = /\[id-([a-zA-Z0-9_-]+)\]/g;

/**
 * 转换引用格式为 FastGPT CITE 格式
 * - 短索引 [id-1], [id-2] -> 需要 chunkIdMap 先转换为完整 ID
 * - 完整 ID [id-xxx] -> [xxx](CITE)
 *
 * @param text 包含引用标记的文本
 * @param chunkIdMap 可选的映射: index(1-based) -> full chunk ID
 */
export function convertCitations(text: string, chunkIdMap?: Map<number, string>): string {
  if (!text) return text;

  let result = text;

  // 第一步: 如果提供了 chunkIdMap，将短索引 [id-1] 转换为完整 ID [id-xxx]
  if (chunkIdMap) {
    result = result.replace(SHORT_INDEX_PATTERN, (_, idx) => {
      const numIdx = parseInt(idx, 10);
      if (chunkIdMap.has(numIdx)) {
        return `[id-${chunkIdMap.get(numIdx)}]`;
      }
      return `[id-${idx}]`; // 保持原样
    });
  }

  // 第二步: 将完整 ID 格式转换为 FastGPT CITE 格式 [xxx](CITE)
  result = result.replace(LEGACY_CITE_PATTERN, '[$1](CITE)');

  return result;
}

// ============================================================
// 流式 Buffer - 处理被分割的引用标记
// ============================================================

/**
 * 流式 Buffer，用于处理可能被分割的引用标记
 * 引用标记如 [id-1] 或 [id-abc123] 可能会被分割成多个 token
 * 该 buffer 在检测到不完整的标记时会累积文本，在完整后输出转换后的文本
 */
export class CitationStreamBuffer {
  private buf: string = '';
  private chunkIdMap: Map<number, string>;

  // 匹配可能成为引用的部分 "[..." 前缀
  private partialRe = /\[(?:\d*|i(?:d(?:-[a-zA-Z0-9_-]*)?)?)?$/;

  constructor(chunkIdMap: Map<number, string> = new Map()) {
    this.chunkIdMap = chunkIdMap;
  }

  /**
   * 输入一个 token，返回可以安全输出的文本（已转换引用格式）
   */
  feed(token: string): string {
    this.buf += token;
    return this.flush();
  }

  /**
   * 流结束时刷新剩余缓冲文本
   */
  flushRemaining(): string {
    const out = convertCitations(this.buf, this.chunkIdMap);
    this.buf = '';
    return out;
  }

  private flush(): string {
    const idx = this.buf.lastIndexOf('[');

    if (idx === -1) {
      // 没有 [ 符号，直接转换并清空
      const out = convertCitations(this.buf, this.chunkIdMap);
      this.buf = '';
      return out;
    }

    const tail = this.buf.slice(idx);

    // 检查是否是短索引格式或完整 ID 格式
    const shortIndexMatch = SHORT_INDEX_PATTERN.exec(tail);
    const legacyMatch = LEGACY_CITE_PATTERN.exec(tail);

    if (shortIndexMatch || legacyMatch) {
      // 找到完整的引用标记，检查后面是否有不完整的部分
      // 重新查找最后的完整匹配
      const shortIndexMatches = [...this.buf.matchAll(SHORT_INDEX_PATTERN)];
      let lastComplete: RegExpExecArray | null =
        shortIndexMatches.length > 0 ? shortIndexMatches[shortIndexMatches.length - 1] : null;

      if (!lastComplete) {
        const legacyMatches = [...this.buf.matchAll(LEGACY_CITE_PATTERN)];
        if (legacyMatches.length > 0) {
          lastComplete = legacyMatches[legacyMatches.length - 1];
        }
      }

      if (lastComplete) {
        const afterMatch = this.buf.slice(lastComplete.index! + lastComplete[0].length);
        if (this.partialRe.test(afterMatch)) {
          // 后面还有不完整的部分，保留缓冲
          const partialStart =
            lastComplete.index! + lastComplete[0].length + afterMatch.lastIndexOf('[');
          const safe = this.buf.slice(0, partialStart);
          this.buf = this.buf.slice(partialStart);
          return convertCitations(safe, this.chunkIdMap);
        }
      }

      // 没有不完整部分，直接转换
      const out = convertCitations(this.buf, this.chunkIdMap);
      this.buf = '';
      return out;
    }

    // 检查是否是不完整的 [ 前缀
    if (this.partialRe.test(tail)) {
      const out = convertCitations(this.buf.slice(0, idx), this.chunkIdMap);
      this.buf = tail;
      return out;
    }

    // 其他情况，直接转换
    const out = convertCitations(this.buf, this.chunkIdMap);
    this.buf = '';
    return out;
  }
}

/**
 * 从 answer 中提取引用 ID 列表
 */
export function extractCitations(answer: string): string[] {
  // 匹配 [1], [1,2], [1-3] 等格式
  const citationPattern = /\[(\d+(?:[,-]\d+)*)\]/g;
  const citations: string[] = [];
  let match;

  while ((match = citationPattern.exec(answer)) !== null) {
    const range = match[1];
    if (range.includes('-') || range.includes(',')) {
      // 范围或列表：1-3 -> 1,2,3
      const parts = range.split(/[,-]/).map((p) => parseInt(p, 10));
      const start = Math.min(...parts);
      const end = Math.max(...parts);
      for (let i = start; i <= end; i++) {
        citations.push(i.toString());
      }
    } else {
      citations.push(range);
    }
  }

  return [...new Set(citations)];
}

/**
 * 验证引用的 chunk 是否存在
 */
export function validateCitations(citedIds: string[], chunks: ChunkItem[]): string[] {
  const validIds = new Set(chunks.map((c) => c.id));
  return citedIds.filter((id) => validIds.has(id));
}

/**
 * 为 answer 添加引用标记
 * 将 chunk index 转换为引用格式
 */
export function formatCitations(chunks: ChunkItem[]): Map<string, string> {
  const citationMap = new Map<string, string>();
  chunks.forEach((chunk, index) => {
    citationMap.set(chunk.id, `[${index + 1}]`);
  });
  return citationMap;
}
