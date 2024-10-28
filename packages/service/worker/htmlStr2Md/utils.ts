import TurndownService from 'turndown';
import { ImageType } from '../readFile/type';
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

    const base64Regex = /"(data:image\/[^;]+;base64[^"]+)"/g;
    const imageList: ImageType[] = [];
    const images = Array.from(html.match(base64Regex) || []);
    for (const image of images) {
      const uuid = crypto.randomUUID();
      const mime = image.split(';')[0].split(':')[1];
      const base64 = image.split(',')[1];
      html = html.replace(image, uuid);
      imageList.push({
        uuid,
        base64,
        mime
      });
    }

    return {
      rawText: turndownService.turndown(html),
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
