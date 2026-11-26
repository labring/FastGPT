import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { SandboxCodeTypeEnum } from '@fastgpt/global/core/workflow/template/system/sandbox/constants';

export type CodeIoDefinition = {
  key: string;
  valueType?: WorkflowIOValueTypeEnum;
};

type CodeLanguage = 'js' | 'python';

type ScanPosition = {
  source: string;
  start: number;
  language: CodeLanguage;
};

const workflowValueTypes = new Set<string>(Object.values(WorkflowIOValueTypeEnum));

const jsMainPattern = /(?:async\s+)?function\s+main\s*\(\s*/y;
const pythonMainPattern = /[ \t]*(?:async[ \t]+)?def[ \t]+main[ \t]*\(/y;
const jsNamedFunctionPattern = /(?:async\s+)?function\s+[\p{L}_$][\p{L}\p{N}_$]*\s*\(/uy;
const jsAnonymousFunctionPattern = /(?:async\s+)?function\s*\(/y;
const pythonDefPattern = /[ \t]*(?:async[ \t]+)?def[ \t]+[\p{L}_][\p{L}\p{N}_]*[ \t]*\(/uy;

const toWorkflowValueType = (value: string | undefined) =>
  value && workflowValueTypes.has(value) ? (value as WorkflowIOValueTypeEnum) : undefined;

const isIdentifierCharacter = (value: string | undefined) =>
  value !== undefined && /[\p{L}\p{N}_$]/u.test(value);

const toCodeLanguage = (codeType: SandboxCodeTypeEnum): CodeLanguage =>
  codeType === SandboxCodeTypeEnum.py ? 'python' : 'js';

/**
 * 按语言读取 start 处的字符串字面量；不是该语言的字符串起点时返回 undefined。
 * 跳过字符串与提取静态属性键共用同一套引号边界：Python 支持三引号，JS 支持模板字符串及 `${}` 嵌套。
 */
const readQuotedValue = ({
  source,
  start,
  language
}: ScanPosition): { end: number; content?: string } | undefined => {
  const quote = source[start];
  const isTemplate = language === 'js' && quote === '`';
  if (!isTemplate && quote !== "'" && quote !== '"') return undefined;

  const delimiter =
    language === 'python' && source.startsWith(quote.repeat(3), start) ? quote.repeat(3) : quote;
  const isMultiline = isTemplate || delimiter.length === 3;
  const contentStart = start + delimiter.length;
  let index = contentStart;

  while (index < source.length) {
    if (source[index] === '\\') {
      // 反斜杠续行在 CRLF 下占两个换行字符，整体跳过避免把 LF 当成未闭合字符串。
      index += source.startsWith('\r\n', index + 1) ? 3 : 2;
      continue;
    }
    if (source.startsWith(delimiter, index)) {
      return { end: index + delimiter.length, content: source.slice(contentStart, index) };
    }
    if (!isMultiline && (source[index] === '\n' || source[index] === '\r')) {
      return { end: index };
    }
    if (isTemplate && source.startsWith('${', index)) {
      index = skipTemplateExpression(source, index + 2);
      continue;
    }
    index += 1;
  }

  return { end: source.length };
};

const skipComment = ({ source, start, language }: ScanPosition) => {
  // Python 只有 `#` 行注释（`//` 是整除）；JS 的 `#` 是私有字段，仅文件首行 `#!` 是注释。
  const isLineComment =
    language === 'python'
      ? source[start] === '#'
      : source.startsWith('//', start) || (start === 0 && source.startsWith('#!'));
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
  // Python 没有正则字面量，`/` 仅表示除号或仅限位置参数分隔符。
  if (language === 'python') return false;
  if (source[start] !== '/' || source[start + 1] === '/' || source[start + 1] === '*') {
    return false;
  }
  const prefix = source.slice(0, start).trimEnd();
  const previous = prefix.at(-1);
  return (
    previous === undefined ||
    ['(', '[', '{', ':', ',', ';', '=', '!', '?', '&', '|'].includes(previous) ||
    // 排除成员访问（如 `limits.in / 2`），避免把成员名后的除号误判为正则起点。
    /(?<![.\p{L}\p{N}_$])(?:return|case|throw|typeof|instanceof|in|of|yield)$/u.test(prefix)
  );
};

const skipRegexLiteral = (source: string, start: number) => {
  let inCharacterClass = false;
  for (let index = start + 1; index < source.length; index += 1) {
    // JS 正则字面量不能跨行；遇到未闭合换行说明当前 `/` 实际是除号，只跳过 `/` 本身。
    if (source[index] === '\n' || source[index] === '\r') return start + 1;
    if (source[index] === '\\') {
      if (source[index + 1] === '\n' || source[index + 1] === '\r') return start + 1;
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
  return start + 1;
};

/** 跳过 start 处的注释、正则字面量或字符串；start 为普通代码时原样返回 start。 */
const skipNonCode = (position: ScanPosition) => {
  const { source, start } = position;
  const commentEnd = skipComment(position);
  if (commentEnd !== start) return commentEnd;
  if (isRegexLiteralStart(position)) return skipRegexLiteral(source, start);
  return readQuotedValue(position)?.end ?? start;
};

/** 跳过 JS 模板字符串 `${` 对应的 `}` 之后的位置，start 指向 `${` 之后。 */
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

/** 判断 offset 是否落在按 language 词法扫描的注释、正则或字符串内部。 */
const isInsideNonCode = ({
  source,
  offset,
  language
}: {
  source: string;
  offset: number;
  language: CodeLanguage;
}) => {
  let index = 0;
  while (index < offset) {
    const codeEnd = skipNonCode({ source, start: index, language });
    index = codeEnd === index ? index + 1 : codeEnd;
  }
  return index !== offset;
};

/** 按 language 自身词法查找明确属于该语言的函数定义特征位置（不限于具名 main）。 */
const findLanguageSyntax = (code: string, language: CodeLanguage): number | undefined => {
  for (let index = 0; index < code.length; index += 1) {
    const codeEnd = skipNonCode({ source: code, start: index, language });
    if (codeEnd !== index) {
      index = codeEnd - 1;
      continue;
    }

    if (language === 'python') {
      if (index !== 0 && code[index - 1] !== '\n') continue;
      pythonDefPattern.lastIndex = index;
      const match = pythonDefPattern.exec(code);
      if (match) return index + match[0].search(/\S/);
      continue;
    }

    if (code.startsWith('=>', index)) return index;
    if (isIdentifierCharacter(code[index - 1]) || code[index - 1] === '.') continue;

    jsNamedFunctionPattern.lastIndex = index;
    if (jsNamedFunctionPattern.test(code)) return index;

    jsAnonymousFunctionPattern.lastIndex = index;
    const anonMatch = jsAnonymousFunctionPattern.exec(code);
    if (!anonMatch) continue;
    const closeParen = findMatchingCharacter({
      source: code,
      start: index + anonMatch[0].length - 1,
      open: '(',
      close: ')',
      language: 'js'
    });
    if (closeParen < 0) continue;
    let bodyStart = closeParen + 1;
    while (/\s/.test(code[bodyStart] ?? '')) bodyStart += 1;
    if (code[bodyStart] === '{') return index;
  }
  return undefined;
};

/** 根据互斥函数语法识别源码语言；无明确特征返回 undefined，双向冲突返回 ambiguous。 */
const detectSourceLanguage = (code: string): CodeLanguage | 'ambiguous' | undefined => {
  const jsPos = findLanguageSyntax(code, 'js');
  const pythonPos = findLanguageSyntax(code, 'python');
  if (jsPos === undefined && pythonPos === undefined) return undefined;
  if (jsPos !== undefined && pythonPos === undefined) return 'js';
  if (pythonPos !== undefined && jsPos === undefined) return 'python';

  // 两种语言特征同时出现时，排除落在另一种语言注释或字符串中的示例片段。
  const isJsReal = !isInsideNonCode({ source: code, offset: jsPos!, language: 'python' });
  const isPythonReal = !isInsideNonCode({ source: code, offset: pythonPos!, language: 'js' });
  if (isJsReal && !isPythonReal) return 'js';
  if (isPythonReal && !isJsReal) return 'python';
  return 'ambiguous';
};

/**
 * 解析源码应采用的词法语言。
 * 节点配置的 codeType 决定运行时解释器，提供时直接采用；未提供时再从源码语法推断。
 */
const resolveCodeLanguage = (
  code: string,
  codeType?: SandboxCodeTypeEnum
): CodeLanguage | undefined => {
  if (codeType) return toCodeLanguage(codeType);

  const detected = detectSourceLanguage(code);
  return detected === 'ambiguous' ? undefined : (detected ?? 'js');
};

/**
 * 判断源码是否明确属于与配置 codeType 相反的语言。
 * 用于跳过 code 与 codeType 分步更新时的不一致中间态，避免按错误语言词法误删端口。
 */
export const isCodeMismatchedWithType = (code: string, codeType: SandboxCodeTypeEnum): boolean => {
  const detected = detectSourceLanguage(code);
  return (
    detected !== undefined && detected !== 'ambiguous' && detected !== toCodeLanguage(codeType)
  );
};

/** 按 language 词法定位具名 main 参数列表起点（JS 指向 `(` 之后，Python 指向 `(`）。 */
const findMainParamsStart = (code: string, language: CodeLanguage): number | undefined => {
  const pattern = language === 'js' ? jsMainPattern : pythonMainPattern;
  for (let index = 0; index < code.length; index += 1) {
    const codeEnd = skipNonCode({ source: code, start: index, language });
    if (codeEnd !== index) {
      index = codeEnd - 1;
      continue;
    }
    const isBoundary =
      language === 'python'
        ? index === 0 || code[index - 1] === '\n'
        : !isIdentifierCharacter(code[index - 1]) && code[index - 1] !== '.';
    if (!isBoundary) continue;

    pattern.lastIndex = index;
    const match = pattern.exec(code);
    if (!match) continue;
    const end = index + match[0].length;
    return language === 'js' ? end : end - 1;
  }
  return undefined;
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
  if (!value || value.startsWith('...') || value.startsWith('**') || value.startsWith('[')) return;
  const quoted = readQuotedValue({ source: value, start: 0, language });
  if (quoted) {
    // 模板字符串不能作为静态属性 key，未闭合字符串不提供 content。
    if (value[0] === '`' || quoted.content === undefined) return;
    if (value.slice(quoted.end).trimStart()[0] !== ':') return;
    return quoted.content.replace(/\\([\\'"`])/g, '$1');
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

/** 提取 main 函数的静态参数名；无法识别动态参数对象时返回 undefined。 */
export const extractCodeInputDefinitions = (
  code: string,
  codeType?: SandboxCodeTypeEnum
): CodeIoDefinition[] | undefined => {
  const language = resolveCodeLanguage(code, codeType);
  if (!language) return undefined;

  const paramsStart = findMainParamsStart(code, language);
  if (paramsStart === undefined) return undefined;

  const documented = getDocumentedDefinitions(code, 'param');

  if (language === 'js') {
    if (code[paramsStart] === ')') return [];
    if (code[paramsStart] !== '{') return undefined;
    const objectEnd = findMatchingCharacter({
      source: code,
      start: paramsStart,
      open: '{',
      close: '}',
      language: 'js'
    });
    if (objectEnd < 0) return undefined;
    const keys = splitTopLevelItems(code.slice(paramsStart + 1, objectEnd), 'js')
      .map((item) => getStaticPropertyKey(item, 'js'))
      .filter((key): key is string => Boolean(key));
    return mergeDefinitions({ keys, documented });
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
  const language = resolveCodeLanguage(code, codeType);
  if (!language) return undefined;

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
export const extractReturnedObjectKeys = (code: string, codeType?: SandboxCodeTypeEnum): string[] =>
  extractReturnedObjectKeysOrUndefined(code, codeType) ?? [];

/** return 对象是输出事实源，JSDoc 只补充可选的类型信息。 */
export const extractCodeOutputDefinitions = (
  code: string,
  codeType?: SandboxCodeTypeEnum
): CodeIoDefinition[] | undefined => {
  const keys = extractReturnedObjectKeysOrUndefined(code, codeType);
  if (!keys) return undefined;
  return mergeDefinitions({ keys, documented: getDocumentedDefinitions(code, 'property') });
};
