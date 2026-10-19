import { WorkflowIOValueTypeEnum } from '../../core/workflow/constants';

type CodeIoDefinition = {
  key: string;
  valueType?: WorkflowIOValueTypeEnum;
};

const workflowValueTypes = new Set<string>(Object.values(WorkflowIOValueTypeEnum));

const toWorkflowValueType = (value: string | undefined) =>
  value && workflowValueTypes.has(value) ? (value as WorkflowIOValueTypeEnum) : undefined;

const isIdentifierCharacter = (value: string | undefined) =>
  value !== undefined && /[\p{L}\p{N}_$]/u.test(value);

/** 跳过字符串及转义字符，避免把其中的 return 和括号误认为代码。 */
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

/** 跳过 JavaScript/Python 注释；未闭合的块注释直接消费至末尾。 */
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

/** 根据前置 token 识别正则字面量，避免把普通除法当作正则。 */
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

/** 跳过正则字符类、转义和 flags，避免其中的括号干扰对象边界。 */
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

/** 按嵌套深度配对括号，跳过注释、字符串和正则；不完整代码返回 -1。 */
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

/** 仅按顶层逗号切分属性，保留嵌套对象、函数调用和字符串中的逗号。 */
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

/** 提取静态属性或简写属性的 key，忽略动态计算和对象展开。 */
const getStaticPropertyKey = (property: string) => {
  let start = 0;
  while (start < property.length) {
    while (/\s/.test(property[start] ?? '')) start += 1;
    const commentEnd = skipComment(property, start);
    if (commentEnd === start) break;
    start = commentEnd;
  }
  const value = property.slice(start).trim();
  if (!value || value.startsWith('...') || value.startsWith('[')) return;
  if (["'", '"'].includes(value[0])) {
    const end = skipQuotedValue(value, 0);
    if (value.slice(end).trimStart()[0] !== ':') return;
    return value.slice(1, end - 1).replace(/\\([\\'"`])/g, '$1');
  }
  return value.match(/^([\p{L}_$][\p{L}\p{N}_$]*)\s*(?::|=|$)/u)?.[1];
};

/**
 * 从代码的静态 return 对象提取输出 key，JSDoc 只提供类型。
 * 没有静态对象时返回 undefined，以便调用方兼容旧注释；空对象返回 []。
 * 注释名与 key 不一致时，仅在数量一致的情况下按声明顺序补充类型。
 */
export const extractCodeOutputDefinitions = (code: string): CodeIoDefinition[] | undefined => {
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

  const keys = extractReturnedObjectKeysOrUndefined(code);
  if (!keys) return;

  const documented = [...code.matchAll(/@property\s*\{([^}]+)\}\s*([^\s-]+)\s*-?\s*.*/g)].map(
    (match) => ({
      key: match[2].trim(),
      valueType: toWorkflowValueType(match[1].trim())
    })
  );
  return keys.map((key, index) => ({
    key,
    valueType:
      documented.find((item) => item.key === key)?.valueType ??
      (documented.length === keys.length ? documented[index]?.valueType : undefined)
  }));
};
