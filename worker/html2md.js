const { parentPort } = require('worker_threads');
const TurndownService = require('turndown');
const domino = require('domino-ext');
const turndownPluginGfm = require('joplin-turndown-plugin-gfm');

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
parentPort?.on('message', (html) => {
  const md = html2md(html);

  parentPort.postMessage(md);
});

const html2md = (html) => {
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
    return '';
  }
};
