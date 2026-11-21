import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { SandboxCodeTypeEnum } from '@fastgpt/global/core/workflow/template/system/sandbox/constants';

export type CodeIoDefinition = {
  key: string;
  valueType?: WorkflowIOValueTypeEnum;
};

const workflowValueTypes = new Set<string>(Object.values(WorkflowIOValueTypeEnum));

const toWorkflowValueType = (value: string | undefined) =>
  value && workflowValueTypes.has(value) ? (value as WorkflowIOValueTypeEnum) : undefined;

const isIdentifierCharacter = (value: string | undefined) =>
  value !== undefined && /[\p{L}\p{N}_$]/u.test(value);

/**
 * 返回 start 处字符串的结束位置。
 * 三引号字符串按整体跳过，内部的单个引号不会提前结束；模板字符串的 `${}` 按 JS 代码扫描，以跳过嵌套的模板和字符串。
 */
const skipQuotedValue = (source: string, start: number): number => {
  const quote = source[start];
  const isTemplate = quote === '`';
  const delimiter =
    !isTemplate && source.startsWith(quote.repeat(3), start) ? quote.repeat(3) : quote;
  let index = start + delimiter.length;
  while (index < source.length) {
    if (source[index] === '\\') {
      index += 2;
      continue;
    }
    if (source.startsWith(delimiter, index)) return index + delimiter.length;
    if (isTemplate && source.startsWith('${', index)) {
      index = skipTemplateExpression(source, index + 2);
      continue;
    }
    index += 1;
  }
  return source.length;
};

type CodeLanguage = 'js' | 'python';

type ScanPosition = {
  source: string;
  start: number;
  language: CodeLanguage;
};

const skipComment = ({ source, start, language }: ScanPosition) => {
  // Python 中 `//` 是整除运算符，只有 `#` 才是注释。
  const isLineComment =
    source[start] === '#' || (language === 'js' && source.startsWith('//', start));
  if (isLineComment) {
    const end = source.indexOf('\n', start + 1);
    return end < 0 ? source.length : end + 1;
  }
  if (language === 'js' && source.startsWith('/*', start)) {
    const end = source.indexOf('*/', start + 2);
    return end < 0 ? source.length : end + 2;
  }
  return start;
};

const isRegexLiteralStart = ({ source, start, language }: ScanPosition) => {
  // Python 没有正则字面量，`/` 只会是运算符或仅限位置参数分隔符。
  if (language === 'python') return false;
  if (source[start] !== '/' || source[start + 1] === '/' || source[start + 1] === '*') {
    return false;
  }
  const prefix = source.slice(0, start).trimEnd();
  const previous = prefix.at(-1);
  return (
    previous === undefined ||
    ['(', '[', '{', ':', ',', ';', '=', '!', '?', '&', '|'].includes(previous) ||
    // `limits.in / 2` 里的 `in` 是成员名，后面的 `/` 是除号。
    /(?<![.\p{L}\p{N}_$])(?:return|case|throw|typeof|instanceof|in|of|yield)$/u.test(prefix)
  );
};

const skipRegexLiteral = (source: string, start: number) => {
  let inCharacterClass = false;
  for (let index = start + 1; index < source.length; index += 1) {
    // 正则字面量不能跨行；到行尾仍未闭合说明这是除号，只跳过它本身。
    if (source[index] === '\n') return start + 1;
    if (source[index] === '\\') {
      index += 1;
      continue;
    }
    if (source[index] === '[') inCharacterClass = true;
    if (source[index] === ']') inCharacterClass = false;
    if (source[index] === '/' && !inCharacterClass) {
      index += 1;
      while (/[a-z]/i.test(source[index] ?? '')) index += 1;
      return index;
    }
  }
  return source.length;
};

/** 返回 start 处注释、正则字面量或字符串的结束位置；start 处是代码时原样返回 start。 */
const skipNonCode = (position: ScanPosition) => {
  const { source, start } = position;
  const commentEnd = skipComment(position);
  if (commentEnd !== start) return commentEnd;
  if (isRegexLiteralStart(position)) return skipRegexLiteral(source, start);
  if (["'", '"', '`'].includes(source[start])) return skipQuotedValue(source, start);
  return start;
};

/** 返回模板字符串中 `${` 对应的 `}` 之后的位置，start 指向 `${` 之后。 */
const skipTemplateExpression = (source: string, start: number): number => {
  let depth = 1;
  let index = start;
  while (index < source.length) {
    const codeEnd = skipNonCode({ source, start: index, language: 'js' });
    if (codeEnd !== index) {
      index = codeEnd;
      continue;
    }
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
    index += 1;
  }
  return source.length;
};

const jsMainPattern = /(?:async\s+)?function\s+main\s*\(\s*/y;
const pythonMainPattern = /[ \t]*(?:async[ \t]+)?def[ \t]+main[ \t]*\(/y;

/**
 * 定位真实的 main 定义并据此判断语言，返回参数列表的起始位置（JS 为 `(` 之后，Python 为 `(`）。
 * 注释和字符串里的示例签名不参与判断；两种入口都找不到时返回 undefined，由调用方保留现有 IO。
 * codeType 是节点配置的语言：先按它查找，另一种语言的示例签名就不会抢先命中。
 */
const findMainEntry = (
  code: string,
  codeType?: SandboxCodeTypeEnum
): { language: CodeLanguage; paramsStart: number } | undefined => {
  const findSignatureEnd = (language: CodeLanguage) => {
    const pattern = language === 'js' ? jsMainPattern : pythonMainPattern;
    for (let index = 0; index < code.length; index += 1) {
      const codeEnd = skipNonCode({ source: code, start: index, language });
      if (codeEnd !== index) {
        index = codeEnd - 1;
        continue;
      }
      // Python 的 def 必须位于行首；JS 的关键字不能是更长标识符的结尾。
      const isBoundary =
        language === 'python'
          ? index === 0 || code[index - 1] === '\n'
          : !isIdentifierCharacter(code[index - 1]);
      if (!isBoundary) continue;
      pattern.lastIndex = index;
      const match = pattern.exec(code);
      if (match) return index + match[0].length;
    }
  };

  const toEntry = (language: CodeLanguage) => {
    const end = findSignatureEnd(language);
    if (end === undefined) return;
    return { language, paramsStart: language === 'js' ? end : end - 1 };
  };

  // 语言和源码可能分两次命令更新，配置的语言找不到入口时再按另一种语言查找。
  // 没有配置时先按 JS 查找：JS 规则会把 Python 的 `#` 注释和字符串一并跳过，不会误判 Python 源码。
  if (codeType === SandboxCodeTypeEnum.py) return toEntry('python') ?? toEntry('js');
  return toEntry('js') ?? toEntry('python');
};

const findMatchingCharacter = ({
  source,
  start,
  open,
  close,
  language
}: {
  source: string;
  start: number;
  open: string;
  close: string;
  language: CodeLanguage;
}) => {
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    const codeEnd = skipNonCode({ source, start: index, language });
    if (codeEnd !== index) {
      index = codeEnd - 1;
      continue;
    }
    if (source[index] === open) depth += 1;
    if (source[index] === close) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
};

const splitTopLevelItems = (value: string, language: CodeLanguage) => {
  const items: string[] = [];
  let start = 0;
  let depth = 0;
  for (let index = 0; index < value.length; index += 1) {
    const codeEnd = skipNonCode({ source: value, start: index, language });
    if (codeEnd !== index) {
      index = codeEnd - 1;
      continue;
    }
    if (['{', '[', '('].includes(value[index])) depth += 1;
    if (['}', ']', ')'].includes(value[index])) depth -= 1;
    if (value[index] === ',' && depth === 0) {
      items.push(value.slice(start, index));
      start = index + 1;
    }
  }
  items.push(value.slice(start));
  return items;
};

/** 跳过条目开头的注释，再解析实际的静态参数或属性。 */
const stripLeadingComments = (item: string, language: CodeLanguage): string => {
  let value = item.trim();
  let commentEnd = skipComment({ source: value, start: 0, language });
  while (commentEnd > 0) {
    value = value.slice(commentEnd).trimStart();
    commentEnd = skipComment({ source: value, start: 0, language });
  }
  return value;
};

const getStaticPropertyKey = (property: string, language: CodeLanguage) => {
  const value = stripLeadingComments(property, language);
  if (!value || value.startsWith('...') || value.startsWith('[')) return;
  if (["'", '"'].includes(value[0])) {
    const end = skipQuotedValue(value, 0);
    if (value.slice(end).trimStart()[0] !== ':') return;
    return value.slice(1, end - 1).replace(/\\([\\'"`])/g, '$1');
  }
  return value.match(/^([\p{L}_$][\p{L}\p{N}_$]*)\s*(?::|=|$)/u)?.[1];
};

const getDocumentedDefinitions = (code: string, tag: 'param' | 'property') =>
  [...code.matchAll(new RegExp(`@${tag}\\s*\\{([^}]+)\\}\\s*([^\\s-]+)\\s*-?\\s*.*`, 'g'))]
    .map((match) => ({
      key: match[2].trim(),
      valueType: toWorkflowValueType(match[1].trim())
    }))
    .filter((item) => item.key);

const mergeDefinitions = ({
  keys,
  documented
}: {
  keys: string[];
  documented: CodeIoDefinition[];
}) =>
  keys
    .filter((key, index) => keys.indexOf(key) === index)
    .map((key, index) => {
      const named = documented.find((item) => item.key === key);
      const annotation =
        named ?? (documented.length === keys.length ? documented[index] : undefined);
      return { key, valueType: annotation?.valueType };
    });

/** 提取 main 函数的静态参数名；无法识别动态参数对象时返回 undefined。codeType 为节点配置的语言。 */
export const extractCodeInputDefinitions = (
  code: string,
  codeType?: SandboxCodeTypeEnum
): CodeIoDefinition[] | undefined => {
  const documented = getDocumentedDefinitions(code, 'param');
  const entry = findMainEntry(code, codeType);
  if (!entry) return undefined;
  const { paramsStart } = entry;

  if (entry.language === 'js') {
    if (code[paramsStart] === ')') return [];
    if (code[paramsStart] !== '{') return undefined;
    const objectStart = paramsStart;
    const objectEnd = findMatchingCharacter({
      source: code,
      start: objectStart,
      open: '{',
      close: '}',
      language: 'js'
    });
    if (objectEnd >= 0) {
      const keys = splitTopLevelItems(code.slice(objectStart + 1, objectEnd), 'js')
        .map((item) => getStaticPropertyKey(item, 'js'))
        .filter((key): key is string => Boolean(key));
      return mergeDefinitions({ keys, documented });
    }
    return undefined;
  }

  const paramsEnd = findMatchingCharacter({
    source: code,
    start: paramsStart,
    open: '(',
    close: ')',
    language: 'python'
  });
  if (paramsEnd < 0) return undefined;
  const keys = splitTopLevelItems(code.slice(paramsStart + 1, paramsEnd), 'python')
    .map(
      (item) =>
        stripLeadingComments(item, 'python')
          .replace(/^\*+/, '')
          .match(/^([\p{L}_][\p{L}\p{N}_]*)/u)?.[1]
    )
    .filter((key): key is string => Boolean(key));
  return mergeDefinitions({ keys, documented });
};

const extractReturnedObjectKeysOrUndefined = (
  code: string,
  codeType?: SandboxCodeTypeEnum
): string[] | undefined => {
  const language = findMainEntry(code, codeType)?.language ?? 'js';
  const keys: string[] = [];
  let foundReturnObject = false;
  for (let index = 0; index < code.length; index += 1) {
    const codeEnd = skipNonCode({ source: code, start: index, language });
    if (codeEnd !== index) {
      index = codeEnd - 1;
      continue;
    }
    if (
      !code.startsWith('return', index) ||
      isIdentifierCharacter(code[index - 1]) ||
      isIdentifierCharacter(code[index + 6])
    ) {
      continue;
    }
    let objectStart = index + 6;
    while (/\s/.test(code[objectStart] ?? '')) objectStart += 1;
    if (code[objectStart] === '(') {
      objectStart += 1;
      while (/\s/.test(code[objectStart] ?? '')) objectStart += 1;
    }
    if (code[objectStart] !== '{') continue;
    const objectEnd = findMatchingCharacter({
      source: code,
      start: objectStart,
      open: '{',
      close: '}',
      language
    });
    if (objectEnd < 0) continue;
    foundReturnObject = true;
    splitTopLevelItems(code.slice(objectStart + 1, objectEnd), language).forEach((property) => {
      const key = getStaticPropertyKey(property, language);
      if (key && !keys.includes(key)) keys.push(key);
    });
    index = objectEnd;
  }
  return foundReturnObject ? keys : undefined;
};

/** 从实际 return 对象提取稳定输出 key；计算属性和展开属性不会被推断为固定输出。 */
export const extractReturnedObjectKeys = (code: string): string[] =>
  extractReturnedObjectKeysOrUndefined(code) ?? [];

/** return 对象是输出事实源，JSDoc 只补充可选的类型信息。 */
export const extractCodeOutputDefinitions = (
  code: string,
  codeType?: SandboxCodeTypeEnum
): CodeIoDefinition[] | undefined => {
  const keys = extractReturnedObjectKeysOrUndefined(code, codeType);
  if (!keys) return;
  return mergeDefinitions({ keys, documented: getDocumentedDefinitions(code, 'property') });
};
