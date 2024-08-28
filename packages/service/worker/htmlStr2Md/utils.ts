import TurndownService from 'turndown';
const domino = require('domino-ext');
const turndownPluginGfm = require('joplin-turndown-plugin-gfm');

export const html2md = (html: string): string => {
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
    const window = domino.createWindow(html);
    const document = window.document;

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

    return turndownService.turndown(document);
  } catch (error) {
    console.log('html 2 markdown error', error);
    return '';
  }
};
