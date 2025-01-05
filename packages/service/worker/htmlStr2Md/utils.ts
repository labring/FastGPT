import TurndownService from 'turndown';
import { ImageType } from '../readFile/type';
import { matchMdImgTextAndUpload } from '@fastgpt/global/common/string/markdown';
import { getNanoid } from '@fastgpt/global/common/string/tools';
// @ts-ignore
const turndownPluginGfm = require('joplin-turndown-plugin-gfm');

const processBase64Images = (htmlContent: string) => {
  const base64Regex = /src="data:([^;]+);base64,([^"]+)"/g;
  const images: ImageType[] = [];

  const processedHtml = htmlContent.replace(base64Regex, (match, mime, base64Data) => {
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

    // Base64 img to id, otherwise it will occupy memory when going to md
    const { processedHtml, images } = processBase64Images(html);
    const md = turndownService.turndown(processedHtml);
    const { text, imageList } = matchMdImgTextAndUpload(md);

    return {
      rawText: text,
      imageList: [...images, ...imageList]
    };
  } catch (error) {
    console.log('html 2 markdown error', error);
    return {
      rawText: '',
      imageList: []
    };
  }
};
