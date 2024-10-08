import TurndownService from 'turndown';
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
    turndownService.remove(['i', 'script', 'iframe', 'style']);

    turndownService.use(turndownPluginGfm.gfm);

    return turndownService.turndown(html);
  } catch (error) {
    console.log('html 2 markdown error', error);
    return '';
  }
};
