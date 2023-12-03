import { simpleText } from './tools';
import TurndownService from 'turndown';
import * as cheerio from 'cheerio';

/* Delete redundant text in markdown */
export const simpleMarkdownText = (rawText: string) => {
  rawText = simpleText(rawText);

  // Remove a line feed from a hyperlink or picture
  rawText = rawText.replace(/\[([\s\S]*?)\]\((.*?)\)/g, (match, linkText, url) => {
    const cleanedLinkText = linkText.replace(/\n/g, ' ').trim();

    return `[${cleanedLinkText}](${url})`;
  });

  // replace special \.* ……
  const reg1 = /\\([-.!`_(){}\[\]])/g;
  if (reg1.test(rawText)) {
    rawText = rawText.replace(/\\([`!*()+-_\[\]{}\\.])/g, '$1');
  }

  // replace \\n
  rawText = rawText.replace(/\\\\n/g, '\\n');

  return rawText.trim();
};

/* html string to markdown */
export const htmlToMarkdown = (html?: string | null) => {
  if (!html) return '';

  const turndownService = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    fence: '```',
    linkStyle: 'inlined',
    linkReferenceStyle: 'full',
    defaultReplacement: (content, node) => {
      if (node.nodeName === 'PRE' || node.nodeName === 'CODE') {
        // @ts-ignore
        const className = node?.getAttribute?.('class') || '';
        const list = className.split('-');
        const language = list[list.length - 1];

        return `\n\`\`\`${language}\n${node.textContent || content}\`\`\`\n`;
      }

      return content;
    }
  });

  const markdown = turndownService.turndown(html).trim();

  return simpleMarkdownText(markdown);
};
