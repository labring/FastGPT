import { marked, type Token } from 'marked';

export type MarkdownBlock = {
  source: string;
  startOffset: number;
};

const markdownReferenceDefinitionPattern = /^\s{0,3}(?:\[[^\]]+\]:|\[\^[^\]]+\]:)/m;

const hasDocumentWideDefinitions = (source: string, tokens: Token[]) =>
  tokens.some((token) => token.type === 'def') || markdownReferenceDefinitionPattern.test(source);

const normalizeLineEndings = (source: string) => {
  let normalizedSource = '';
  const sourceOffsets = [0];

  for (let index = 0; index < source.length; index++) {
    if (source[index] === '\r') {
      if (source[index + 1] === '\n') index++;
      normalizedSource += '\n';
    } else {
      normalizedSource += source[index];
    }
    sourceOffsets.push(index + 1);
  }

  return { normalizedSource, sourceOffsets };
};

/**
 * 按 Markdown 根级 block 的原始 token 范围切分流式内容。
 *
 * marked lexer 只做词法切分，比每次构造并遍历 unified AST 更轻；根级 token 的 raw
 * 字符串可以保留代码块、表格、列表和引用的完整语法。引用定义和脚注会跨 block
 * 解析，因此遇到这些文档级定义时仍回退到完整 source，保持 ReactMarkdown 的语义。
 */
export const splitMarkdownBlocks = (source: string): MarkdownBlock[] => {
  if (!source) return [];

  const { normalizedSource, sourceOffsets } = normalizeLineEndings(source);
  const tokens = marked.lexer(normalizedSource, { gfm: true, breaks: true });
  if (hasDocumentWideDefinitions(source, tokens)) {
    return [{ source, startOffset: 0 }];
  }

  const blocks: MarkdownBlock[] = [];
  let searchOffset = 0;

  for (const token of tokens) {
    const tokenSource = token.raw;
    if (!tokenSource) continue;

    const normalizedStartOffset = normalizedSource.indexOf(tokenSource, searchOffset);
    if (normalizedStartOffset < 0) continue;

    searchOffset = normalizedStartOffset + tokenSource.length;
    if (token.type === 'space') continue;

    const blockSourceLength = tokenSource.replace(/\n+$/, '').length;
    if (!blockSourceLength) continue;

    const startOffset = sourceOffsets[normalizedStartOffset];
    const endOffset = sourceOffsets[normalizedStartOffset + blockSourceLength];
    blocks.push({ source: source.slice(startOffset, endOffset), startOffset });
  }

  // A non-empty source can contain only whitespace, which the lexer omits.
  // Keep one fallback block so the renderer preserves the existing empty-state behavior.
  if (blocks.length === 0) {
    return [{ source, startOffset: 0 }];
  }

  return blocks;
};
