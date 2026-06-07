import TurndownService from 'turndown';
import { simpleMarkdownText } from '@fastgpt/global/common/string/markdown';
import { getLogger, LogCategories } from '../../common/logger';
import { workerEnv } from '../env';
import { gfm } from 'joplin-turndown-plugin-gfm';
import { uploadBase64Image } from '../utils/base64ImageUpload';
import { type UploadFileHandler } from '../readFile/type';
import { batchRun } from '@fastgpt/global/common/system/utils';

const MAX_HTML_SIZE = workerEnv.MAX_HTML_TRANSFORM_CHARS;
const logger = getLogger(LogCategories.INFRA.WORKER);
const htmlBase64UploadConcurrency = 5;

const htmlBase64SrcRegex = /\bsrc\s*=\s*(["'])data:([^;]+);base64,([A-Za-z0-9+/=]+)\1/gi;

/**
 * HTML 转 markdown 前实时处理 base64 图片。
 *
 * 有 uploadFile 时上传为对象存储 key；没有 uploadFile 时删除 src，避免大体积 base64
 * 进入 turndown 或被 worker 结果回传。
 */
const processBase64Images = async (
  htmlContent: string,
  options: {
    uploadFile?: UploadFileHandler;
  } = {}
) => {
  const matches = Array.from(htmlContent.matchAll(htmlBase64SrcRegex));
  if (matches.length === 0) return htmlContent;

  const replacements = await batchRun(
    matches,
    async (match) => {
      const [, quote, mime, base64Data] = match;

      if (!options.uploadFile) {
        return `src=${quote}${quote}`;
      }

      try {
        const { key } = await uploadBase64Image({
          mime,
          base64: base64Data,
          uploadFile: options.uploadFile
        });
        return `src=${quote}${key}${quote}`;
      } catch (error) {
        logger.warn('Failed to upload parsed HTML base64 image', { mime, error });
        return `src=${quote}${quote}`;
      }
    },
    htmlBase64UploadConcurrency
  );

  let result = '';
  let lastIndex = 0;

  for (const [matchIndex, match] of matches.entries()) {
    const [fullMatch] = match;
    const index = match.index ?? 0;

    result += htmlContent.slice(lastIndex, index);
    result += replacements[matchIndex];
    lastIndex = index + fullMatch.length;
  }

  return result + htmlContent.slice(lastIndex);
};

export const html2md = async (
  html: string,
  options: {
    uploadFile?: UploadFileHandler;
  } = {}
): Promise<{
  rawText: string;
}> => {
  const turndownService = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    fence: '```',
    emDelimiter: '_',
    strongDelimiter: '**',
    linkStyle: 'inlined',
    linkReferenceStyle: 'full'
  });

  try {
    turndownService.remove(['i', 'script', 'iframe', 'style']);
    turndownService.use(gfm);

    // add custom handling for media tag
    turndownService.addRule('media', {
      filter: ['video', 'source', 'audio'],
      replacement: function (content, node) {
        const mediaNode = node as HTMLVideoElement | HTMLAudioElement | HTMLSourceElement;
        const src = mediaNode.getAttribute('src');
        const sources = mediaNode.getElementsByTagName('source');
        const firstSourceSrc = sources.length > 0 ? sources[0].getAttribute('src') : null;
        const mediaSrc = src || firstSourceSrc;

        if (mediaSrc) {
          return `[${mediaSrc}](${mediaSrc}) `;
        }

        return content;
      }
    });

    // Base64 img to id, otherwise it will occupy memory when going to md
    const processedHtml = await processBase64Images(html, {
      uploadFile: options.uploadFile
    });

    // if html is too large, return the original html
    if (processedHtml.length > MAX_HTML_SIZE) {
      return { rawText: processedHtml };
    }

    const md = turndownService.turndown(processedHtml);

    return {
      rawText: simpleMarkdownText(md)
    };
  } catch (error) {
    if (options.uploadFile) {
      throw error;
    }

    logger.error('HTML to markdown conversion failed', { error });
    return {
      rawText: ''
    };
  }
};
