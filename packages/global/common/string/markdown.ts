import { simpleText } from './tools';
import { NodeHtmlMarkdown } from 'node-html-markdown';

/* Delete redundant text in markdown */
export const simpleMarkdownText = (rawText: string) => {
  rawText = simpleText(rawText);

  // Remove a line feed from a hyperlink or picture
  rawText = rawText.replace(/\[([^\]]+)\]\((.+?)\)/g, (match, linkText, url) => {
    const cleanedLinkText = linkText.replace(/\n/g, ' ').trim();

    if (!url) {
      return '';
    }

    return `[${cleanedLinkText}](${url})`;
  });

  // replace special \.* ……
  const reg1 = /\\([-.!`_(){}\[\]])/g;
  if (reg1.test(rawText)) {
    rawText = rawText.replace(/\\([`!*()+-_\[\]{}\\.])/g, '$1');
  }

  // replace \\n
  rawText = rawText.replace(/\\\\n/g, '\\n');

  // Remove headings and code blocks front spaces
  ['####', '###', '##', '#', '```', '~~~'].forEach((item) => {
    const reg = new RegExp(`\\n\\s*${item}`, 'g');
    if (reg.test(rawText)) {
      rawText = rawText.replace(new RegExp(`\\n\\s*(${item})`, 'g'), '\n$1');
    }
  });

  return rawText.trim();
};

/* html string to markdown */
export const htmlToMarkdown = (html?: string | null) => {
  if (!html) return '';

  const surround = (source: string, surroundStr: string) => `${surroundStr}${source}${surroundStr}`;

  const nhm = new NodeHtmlMarkdown(
    {
      codeFence: '```',
      codeBlockStyle: 'fenced',
      ignore: ['i', 'script']
    },
    {
      code: ({ node, parent, options: { codeFence, codeBlockStyle }, visitor }) => {
        const isCodeBlock = ['PRE', 'WRAPPED-PRE'].includes(parent?.tagName!);

        if (!isCodeBlock) {
          return {
            spaceIfRepeatingChar: true,
            noEscape: true,
            postprocess: ({ content }) => {
              // Find longest occurring sequence of running backticks and add one more (so content is escaped)
              const delimiter =
                '`' + (content.match(/`+/g)?.sort((a, b) => b.length - a.length)?.[0] || '');
              const padding = delimiter.length > 1 ? ' ' : '';

              return surround(surround(content, padding), delimiter);
            }
          };
        }

        /* Handle code block */
        if (codeBlockStyle === 'fenced') {
          const language =
            node.getAttribute('class')?.match(/language-(\S+)/)?.[1] ||
            parent?.getAttribute('class')?.match(/language-(\S+)/)?.[1] ||
            '';

          return {
            noEscape: true,
            prefix: `${codeFence}${language}\n`,
            postfix: `\n${codeFence}\n`,
            childTranslators: visitor.instance.codeBlockTranslators
          };
        }

        return {
          noEscape: true,
          postprocess: ({ content }) => content.replace(/^/gm, '    '),
          childTranslators: visitor.instance.codeBlockTranslators
        };
      }
    }
  );

  const markdown = nhm.translate(html).trim();

  return simpleMarkdownText(markdown);
};
