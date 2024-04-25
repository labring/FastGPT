import { parentPort } from 'worker_threads';
import TurndownService from 'turndown';
//@ts-ignore
import domino from 'domino';
//@ts-ignore
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
parentPort?.on('message', (params: { html: string }) => {
  const html2md = (html: string): string => {
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

      // @ts-ignore
      return turndownService.turndown(document);
    } catch (error) {
      return '';
    }
  };

  try {
    const md = html2md(params?.html || '');

    parentPort?.postMessage({
      type: 'success',
      data: md
    });
  } catch (error) {
    parentPort?.postMessage({
      type: 'error',
      data: error
    });
  }

  global?.close?.();
});
