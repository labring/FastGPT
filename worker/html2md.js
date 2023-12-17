const { parentPort } = require('worker_threads');
const TurndownService = require('turndown');
const domino = require('domino-ext');

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
  var window = domino.createWindow(html);
  var document = window.document;

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

  // const markdown = nhm.translate(html).trim();
  const markdown = turndownService.turndown(document);

  parentPort.postMessage(markdown);
});
