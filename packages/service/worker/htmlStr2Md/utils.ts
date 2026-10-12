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

/** A markdown table's second line, `| --- |` with optional alignment colons. */
const isDivider = (line?: string) => !!line && /^\|(?:\s*:?-{3,}:?\s*\|)+$/.test(line);

/** The cells a converted row holds, colspan padding included: its unescaped pipes, less one. */
const cellCount = (line: string) => Math.max((line.match(/(?<!\\)\|/g) || []).length - 1, 0);

/**
 * The conditions under which joplin-turndown-plugin-gfm lays a table out as
 * plain paragraphs instead of rows: no rows, a single cell, or a nested table.
 */
const tableIsSkipped = (table: HTMLTableElement) =>
  !table.rows ||
  (table.rows.length === 1 && table.rows[0].childNodes.length <= 1) ||
  !!table.querySelector('table');

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

    // The plugin has no caption rule, so a caption's text landed among the
    // rows, where it breaks the table. Turndown converts a table's children
    // first, so the caption is held here and written above the table instead.
    const captions = new WeakMap<Node, string>();
    turndownService.addRule('tableCaption', {
      filter: 'caption',
      replacement: function (content, node) {
        if (node.parentNode) captions.set(node.parentNode, content.trim());
        return '';
      }
    });

    // joplin-turndown-plugin-gfm only treats a row as the header when every
    // cell is a <th>. A table written with <td> throughout therefore gets an
    // empty header row, and its column names drop into the first body row --
    // where the header is what gives every value in the table its meaning.
    // A later rule wins in turndown, so this one replaces the plugin's.
    turndownService.addRule('tableHeader', {
      filter: (node) => node.nodeName === 'TABLE',
      replacement: function (content, node) {
        const caption = captions.get(node);
        const title = caption ? `${caption}\n\n` : '';
        // Leave a table the plugin lays out as paragraphs exactly as it is.
        if (tableIsSkipped(node as HTMLTableElement)) return `${title}${content}`;

        const lines = content.replace(/\n+/g, '\n').trim().split('\n');
        // GFM drops every cell past the header's width, so the header has to
        // be as wide as the widest row, not only as wide as the first one.
        const columns = lines.reduce((widest, line) => Math.max(widest, cellCount(line)), 0);
        if (columns < 1) return `\n\n${title}${lines.join('\n')}\n\n`;

        const hasHeader = isDivider(lines[1]);
        const header = lines[0] + '     |'.repeat(Math.max(columns - cellCount(lines[0]), 0));
        const divider = hasHeader
          ? lines[1] + ' --- |'.repeat(Math.max(columns - cellCount(lines[1]), 0))
          : `|${' --- |'.repeat(columns)}`;
        const body = lines.slice(hasHeader ? 2 : 1);
        return `\n\n${title}${[header, divider, ...body].join('\n')}\n\n`;
      }
    });

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
