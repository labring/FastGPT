/**
 * Feishu/Lark document to Markdown with image support.
 *
 * Uses doc2markdown (feishu2markdown) to convert a single doc to markdown including
 * images. Images are returned as base64 data URLs so that the caller (read.ts) can
 * run them through the same KB image pipeline: matchMdImg → uploadImage2S3Bucket.
 *
 * The doc2markdown library hardcodes https://open.feishu.cn. We patch the handler
 * instance to use a configurable base URL (FEISHU_BASE_URL / open.lark.com) so that
 * both Feishu (China) and Lark (International) work.
 *
 * @see https://www.npmjs.com/package/feishu2markdown
 * @see https://github.com/AntiMoron/doc2markdown
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { axios } from '../../../../common/api/axios';
import { getLogger, LogCategories } from '../../../../common/logger';

const logger = getLogger(LogCategories.MODULE.DATASET.API_DATASET);

export type FeishuDocToMarkdownParams = {
  /** API base URL, e.g. https://open.feishu.cn or https://open.lark.com */
  baseUrl: string;
  appId: string;
  appSecret: string;
  /** Document token (same as apiFileId) */
  docToken: string;
  /**
   * Called with the local path of each image file; return a data URL (e.g. data:image/png;base64,...)
   * so that the markdown contains base64 images. The KB pipeline in read.ts will then upload them to S3.
   */
  handleImage: (localImagePath: string) => Promise<string>;
};

export type FeishuDocToMarkdownResult = {
  title: string;
  markdown: string;
};

const DEFAULT_BASE_URL = 'https://open.feishu.cn';

/**
 * Convert a single Feishu/Lark document to markdown with images as base64.
 * Returns null if conversion fails (caller should fall back to raw_content API).
 */
export async function feishuDocToMarkdown(
  params: FeishuDocToMarkdownParams
): Promise<FeishuDocToMarkdownResult | null> {
  const { baseUrl, appId, appSecret, docToken, handleImage } = params;
  const apiBaseUrl = baseUrl || DEFAULT_BASE_URL;
  const imageDir = path.join(os.tmpdir(), `feishu_${docToken}_images`);

  const cleanup = () => {
    try {
      if (fs.existsSync(imageDir)) {
        fs.rmSync(imageDir, { recursive: true, force: true });
      }
    } catch (err) {
      logger.warn('Feishu temp image dir cleanup failed', { imageDir, error: err });
    }
  };

  try {
    const { FeishuDoc2Markdown } = await import('doc2markdown/dist/src/doc/impl/feishu');

    const handler = new FeishuDoc2Markdown({
      type: 'feishu',
      appId,
      appSecret,
      docToken,
      imageStorageTarget: os.tmpdir(),
      disableImageCache: true,
      handleImage
    });

    const getHeaders = () => (handler as { getHeaders: () => Record<string, string> }).getHeaders();

    (
      handler as { getAccessToken: () => Promise<{ expireTime: number; accessToken: string }> }
    ).getAccessToken = async () => {
      const { data } = await axios.post<{
        tenant_access_token: string;
        code: number;
        msg?: string;
        expire: number;
      }>(
        `${apiBaseUrl}/open-apis/auth/v3/tenant_access_token/internal`,
        { app_id: appId, app_secret: appSecret },
        { headers: { 'Content-Type': 'application/json; charset=utf-8' } }
      );
      if (data.code !== 0) throw new Error(`Feishu auth failed: ${data.msg}`);
      return {
        expireTime: Date.now() + data.expire * 1000 - 3000,
        accessToken: data.tenant_access_token
      };
    };

    (
      handler as { getDocMetadata: (documentId: string) => Promise<Record<string, unknown>> }
    ).getDocMetadata = async (documentId: string) => {
      const { data } = await axios.get(`${apiBaseUrl}/open-apis/docx/v1/documents/${documentId}`, {
        headers: getHeaders()
      });
      const doc = (data as { data?: { document?: Record<string, unknown> } })?.data?.document;
      if (!doc) throw new Error('No document');
      return {
        ...doc,
        id: doc.document_id,
        token: doc.document_id,
        url: doc.url,
        name: doc.title
      };
    };

    (handler as { getRawDocContent: (documentId: string) => Promise<unknown> }).getRawDocContent =
      async (documentId: string) => {
        const { data } = await axios.get(
          `${apiBaseUrl}/open-apis/docx/v1/documents/${documentId}/blocks`,
          { headers: getHeaders() }
        );
        return (data as { data?: unknown })?.data;
      };

    (
      handler as unknown as {
        getFileList: (folderToken: string, nextPageToken?: string) => Promise<unknown>;
      }
    ).getFileList = async (folderToken: string, nextPageToken?: string) => {
      const req: Record<string, string | number> = {
        folder_token: folderToken,
        page_size: 200
      };
      if (nextPageToken) req.page_token = nextPageToken;
      const { data } = await axios.get(`${apiBaseUrl}/open-apis/drive/v1/files`, {
        headers: getHeaders(),
        params: req
      });
      return (data as { data?: unknown })?.data;
    };

    (
      handler as unknown as {
        handleFeishuImage: (
          _documentId: string,
          resourceToken: string,
          _imageMeta?: Record<string, unknown>
        ) => Promise<string>;
      }
    ).handleFeishuImage = async (_documentId: string, resourceToken: string): Promise<string> => {
      const downloadUrl = `${apiBaseUrl}/open-apis/drive/v1/medias/${resourceToken}/download`;
      if (!fs.existsSync(imageDir)) {
        fs.mkdirSync(imageDir, { recursive: true });
      }
      const imagePath = path.join(imageDir, `${resourceToken}.jpg`);

      const response = await axios({
        url: downloadUrl,
        method: 'GET',
        headers: getHeaders(),
        responseType: 'stream'
      });
      const writer = fs.createWriteStream(imagePath);
      response.data.pipe(writer);
      await new Promise<void>((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });

      return imagePath;
    };

    await (handler as { getCachedAccessToken: () => Promise<unknown> }).getCachedAccessToken();
    const tasks = await (
      handler as { getDocTaskList: () => Promise<{ id: string; name?: string; url?: string }[]> }
    ).getDocTaskList();
    if (!tasks?.length) {
      cleanup();
      return null;
    }

    const task = tasks[0];
    const markdown = await (
      handler as { handleDocTask: (t: typeof task) => Promise<string> }
    ).handleDocTask(task);
    cleanup();

    return {
      title: task.name || task.id || '',
      markdown: markdown || ''
    };
  } catch (err) {
    cleanup();
    logger.warn('Feishu doc2markdown failed', { docToken, error: err });
    return null;
  }
}
