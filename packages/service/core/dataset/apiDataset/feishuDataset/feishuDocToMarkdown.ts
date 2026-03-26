/**
 * Feishu/Lark document to Markdown with image support.
 *
 * Uses doc2markdown (>= 1.3.2) with native baseUrl support to convert a single doc
 * to markdown including images. Images are returned as base64 data URLs so that the
 * caller (read.ts) can run them through the KB image pipeline: matchMdImg → uploadImage2S3Bucket.
 */

import fs from 'node:fs';
import path from 'node:path';
import { getLogger, LogCategories } from '../../../../common/logger';

const logger = getLogger(LogCategories.MODULE.DATASET.API_DATASET);

export type FeishuDocToMarkdownParams = {
  /** API base URL, e.g. https://open.feishu.cn or https://open.lark.com */
  baseUrl: string;
  appId: string;
  appSecret: string;
  /** Document token (same as apiFileId) */
  docToken: string;
};

export type FeishuDocToMarkdownResult = {
  title: string;
  markdown: string;
};

/**
 * Convert a single Feishu/Lark document to markdown with images as base64.
 * Returns null if conversion fails (caller should fall back to raw_content API).
 */
export async function feishuDocToMarkdown(
  params: FeishuDocToMarkdownParams
): Promise<FeishuDocToMarkdownResult | null> {
  const { baseUrl, appId, appSecret, docToken } = params;

  try {
    const { FeishuDoc2Markdown } = await import('doc2markdown/dist/src/doc/impl/feishu');

    const handler = new FeishuDoc2Markdown({
      type: 'feishu',
      baseUrl,
      appId,
      appSecret,
      docToken,
      disableImageCache: true,
      handleImage: async (localImagePath: string) => {
        try {
          const buffer = await fs.promises.readFile(localImagePath);
          const ext = path.extname(localImagePath).toLowerCase().replace('.', '');
          const mime: Record<string, string> = {
            png: 'image/png',
            gif: 'image/gif',
            webp: 'image/webp'
          };
          const mimeType = mime[ext] || 'image/jpeg';
          return `data:${mimeType};base64,${buffer.toString('base64')}`;
        } catch (err) {
          logger.warn('Feishu image read failed', { localImagePath, error: err });
          return '';
        }
      }
    });

    await handler.getCachedAccessToken();
    const tasks = await handler.getDocTaskList();
    if (!tasks?.length) return null;

    const task = tasks[0];
    const markdown = await handler.handleDocTask(task);

    return {
      title: task.name || task.id || '',
      markdown: markdown || ''
    };
  } catch (err) {
    logger.warn('Feishu doc2markdown failed', { docToken, error: err });
    return null;
  }
}
