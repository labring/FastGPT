import TurndownService from 'turndown';
// @ts-ignore
import * as turndownPluginGfm from 'joplin-turndown-plugin-gfm';

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
export const htmlStr2Md = (html: string) => {
  // 浏览器，html字符串转dom
  const parser = new DOMParser();
  const dom = parser.parseFromString(html, 'text/html');

  turndownService.remove(['i', 'script', 'iframe']);
  turndownService.addRule('codeBlock', {
    filter: 'pre',
    replacement(_, node) {
      const content = node.textContent?.trim() || '';
      // @ts-ignore
      const codeName = node?._attrsByQName?.class?.data?.trim() || '';

      return `\n\`\`\`${codeName}\n${content}\n\`\`\`\n`;
    }
  });

  turndownService.use(turndownPluginGfm.gfm);

  return turndownService.turndown(dom);
};
