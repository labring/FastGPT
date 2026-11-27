import { Readable } from 'node:stream';
import { parseTarZstStream, type ParsedTarEntry } from '@fastgpt/service/common/file/tarZst';

export type CollectedTarZstEntry = Omit<ParsedTarEntry, 'stream'> & { content: Buffer };

/** 测试辅助：把 `.tar.zst` Buffer 或流完整解析为内存条目数组。 */
export const readTarZstEntries = async (
  source: Buffer | Readable,
  options: { maxEntries?: number; maxTotalBytes?: number } = {}
): Promise<CollectedTarZstEntry[]> => {
  const entries: CollectedTarZstEntry[] = [];
  await parseTarZstStream({
    stream: Buffer.isBuffer(source) ? Readable.from([source]) : source,
    ...options,
    onEntry: async ({ stream, ...meta }) => {
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(chunk);
      entries.push({ ...meta, content: Buffer.concat(chunks) });
    }
  });
  return entries;
};
