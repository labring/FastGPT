import TurndownService from 'turndown';
import { ImageType } from '../readFile/type';
import { matchMdImgTextAndUpload } from '@fastgpt/global/common/string/markdown';
// @ts-ignore
const turndownPluginGfm = require('joplin-turndown-plugin-gfm');

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

    const { text, imageList } = matchMdImgTextAndUpload(html);

    return {
      rawText: turndownService.turndown(text),
      imageList
    };
  } catch (error) {
    console.log('html 2 markdown error', error);
    return {
      rawText: '',
      imageList: []
    };
  }
};
