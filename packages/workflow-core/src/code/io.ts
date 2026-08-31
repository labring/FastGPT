import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';

export type CodeIoDefinition = {
  key: string;
  valueType?: WorkflowIOValueTypeEnum;
};

const workflowValueTypes = new Set<string>(Object.values(WorkflowIOValueTypeEnum));

const toWorkflowValueType = (value: string | undefined) =>
  value && workflowValueTypes.has(value) ? (value as WorkflowIOValueTypeEnum) : undefined;

const isIdentifierCharacter = (value: string | undefined) =>
  value !== undefined && /[\p{L}\p{N}_$]/u.test(value);

const skipQuotedValue = (source: string, start: number) => {
  const quote = source[start];
  let index = start + 1;
  while (index < source.length) {
    if (source[index] === '\\') {
      index += 2;
      continue;
    }
    if (source[index] === quote) return index + 1;
    index += 1;
  }
  return source.length;
};

const skipComment = (source: string, start: number) => {
  if (source.startsWith('//', start) || source[start] === '#') {
    const end = source.indexOf('\n', start + 1);
    return end < 0 ? source.length : end + 1;
  }
  if (source.startsWith('/*', start)) {
    const end = source.indexOf('*/', start + 2);
    return end < 0 ? source.length : end + 2;
  }
  return start;
};

const isRegexLiteralStart = (source: string, start: number) => {
  if (source[start] !== '/' || source[start + 1] === '/' || source[start + 1] === '*') {
    return false;
  }
  const prefix = source.slice(0, start).trimEnd();
  const previous = prefix.at(-1);
  return (
    previous === undefined ||
    ['(', '[', '{', ':', ',', ';', '=', '!', '?', '&', '|'].includes(previous) ||
    /\b(?:return|case|throw|typeof|instanceof|in|of|yield)$/.test(prefix)
  );
};

const skipRegexLiteral = (source: string, start: number) => {
  let inCharacterClass = false;
  for (let index = start + 1; index < source.length; index += 1) {
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

const findMatchingCharacter = ({
  source,
  start,
  open,
  close
}: {
  source: string;
  start: number;
  open: string;
  close: string;
}) => {
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    const commentEnd = skipComment(source, index);
    if (commentEnd !== index) {
      index = commentEnd - 1;
      continue;
    }
    if (isRegexLiteralStart(source, index)) {
      index = skipRegexLiteral(source, index) - 1;
      continue;
    }
    if (["'", '"', '`'].includes(source[index])) {
      index = skipQuotedValue(source, index) - 1;
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

const splitTopLevelItems = (value: string) => {
  const items: string[] = [];
  let start = 0;
  let depth = 0;
  for (let index = 0; index < value.length; index += 1) {
    const commentEnd = skipComment(value, index);
    if (commentEnd !== index) {
      index = commentEnd - 1;
      continue;
    }
    if (isRegexLiteralStart(value, index)) {
      index = skipRegexLiteral(value, index) - 1;
      continue;
    }
    if (["'", '"', '`'].includes(value[index])) {
      index = skipQuotedValue(value, index) - 1;
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

const getStaticPropertyKey = (property: string) => {
  const value = property.trim();
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
    .map((key, index) => ({
      key,
      valueType:
        documented.find((item) => item.key === key)?.valueType ??
        (documented.length === keys.length ? documented[index]?.valueType : undefined)
    }));

/** 提取 main 函数的静态参数名；无法识别动态参数对象时返回 undefined。 */
export const extractCodeInputDefinitions = (code: string): CodeIoDefinition[] | undefined => {
  const documented = getDocumentedDefinitions(code, 'param');
  const jsMatch = code.match(/(?:async\s+)?function\s+main\s*\(\s*/);
  if (jsMatch?.index !== undefined) {
    const paramsStart = jsMatch.index + jsMatch[0].length;
    if (code[paramsStart] === ')') return [];
    if (code[paramsStart] !== '{') return undefined;
    const objectStart = paramsStart;
    const objectEnd = findMatchingCharacter({
      source: code,
      start: objectStart,
      open: '{',
      close: '}'
    });
    if (objectEnd >= 0) {
      const keys = splitTopLevelItems(code.slice(objectStart + 1, objectEnd))
        .map(getStaticPropertyKey)
        .filter((key): key is string => Boolean(key));
      return mergeDefinitions({ keys, documented });
    }
  }

  const pythonMatch = code.match(/def\s+main\s*\(/);
  if (pythonMatch?.index !== undefined) {
    const paramsStart = pythonMatch.index + pythonMatch[0].length - 1;
    const paramsEnd = findMatchingCharacter({
      source: code,
      start: paramsStart,
      open: '(',
      close: ')'
    });
    if (paramsEnd >= 0) {
      const keys = splitTopLevelItems(code.slice(paramsStart + 1, paramsEnd))
        .map(
          (item) =>
            item
              .trim()
              .replace(/^\*+/, '')
              .match(/^([\p{L}_][\p{L}\p{N}_]*)/u)?.[1]
        )
        .filter((key): key is string => Boolean(key));
      return mergeDefinitions({ keys, documented });
    }
  }

  return undefined;
};

const extractReturnedObjectKeysOrUndefined = (code: string): string[] | undefined => {
  const keys: string[] = [];
  let foundReturnObject = false;
  for (let index = 0; index < code.length; index += 1) {
    const commentEnd = skipComment(code, index);
    if (commentEnd !== index) {
      index = commentEnd - 1;
      continue;
    }
    if (isRegexLiteralStart(code, index)) {
      index = skipRegexLiteral(code, index) - 1;
      continue;
    }
    if (["'", '"', '`'].includes(code[index])) {
      index = skipQuotedValue(code, index) - 1;
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
      close: '}'
    });
    if (objectEnd < 0) continue;
    foundReturnObject = true;
    splitTopLevelItems(code.slice(objectStart + 1, objectEnd)).forEach((property) => {
      const key = getStaticPropertyKey(property);
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
export const extractCodeOutputDefinitions = (code: string): CodeIoDefinition[] | undefined => {
  const keys = extractReturnedObjectKeysOrUndefined(code);
  if (!keys) return;
  return mergeDefinitions({ keys, documented: getDocumentedDefinitions(code, 'property') });
};
