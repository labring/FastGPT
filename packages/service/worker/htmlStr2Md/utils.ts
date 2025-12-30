import TurndownService from 'turndown';
import { type ImageType } from '../readFile/type';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { simpleMarkdownText } from '@fastgpt/global/common/string/markdown';
// @ts-ignore
const turndownPluginGfm = require('joplin-turndown-plugin-gfm');

const MAX_HTML_SIZE = Number(process.env.MAX_HTML_TRANSFORM_CHARS || 1000000);

const processBase64Images = (htmlContent: string) => {
  // 优化后的正则:
  // 1. 使用精确的 base64 字符集 [A-Za-z0-9+/=]+ 避免回溯
  // 2. 明确捕获 mime 类型和 base64 数据
  // 3. 减少不必要的捕获组
  const base64Regex = /src="data:([^;]+);base64,([A-Za-z0-9+/=]+)"/g;
  const images: ImageType[] = [];

  const processedHtml = htmlContent.replace(base64Regex, (_match, mime, base64Data) => {
    const uuid = `IMAGE_${getNanoid(12)}_IMAGE`;
    images.push({
      uuid,
      base64: base64Data,
      mime
    });
    return `src="${uuid}"`;
  });

  return { processedHtml, images };
};

export const html2md = (
  html: string
): {
  rawText: string;
  imageList: ImageType[];
} => {
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
    turndownService.use(turndownPluginGfm.gfm);

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
    const { processedHtml, images } = processBase64Images(html);

    // if html is too large, return the original html (but preserve image list)
    if (processedHtml.length > MAX_HTML_SIZE) {
      return { rawText: processedHtml, imageList: images };
    }

    const md = turndownService.turndown(processedHtml);
    // const { text, imageList } = matchMdImg(md);

    return {
      rawText: simpleMarkdownText(md),
      imageList: images
    };
  } catch (error) {
    console.log('html 2 markdown error', error);
    return {
      rawText: '',
      imageList: []
    };
  }
};
