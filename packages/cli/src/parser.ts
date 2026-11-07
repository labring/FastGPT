import Ajv2020 from 'ajv/dist/2020.js';
import { datasetInputSchemas } from '@fastgpt-sdk/client/dataset/schema';
import type { DatasetOperation } from '@fastgpt-sdk/client/dataset/type';

type InputSchema = {
  type?: string | string[];
  properties?: Record<string, InputSchema>;
  items?: InputSchema;
  anyOf?: InputSchema[];
  oneOf?: InputSchema[];
  allOf?: InputSchema[];
};
export type CliFlag = { name: string; value?: string };

/** 将选项与位置参数分离；字符串值允许为负数，重复选项留给数组参数统一处理。 */
export const parseArguments = (argv: string[]) => {
  const words: string[] = [];
  const flags: CliFlag[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-h') {
      flags.push({ name: 'help' });
      continue;
    }
    if (arg === '-v') {
      flags.push({ name: 'version' });
      continue;
    }
    if (!arg.startsWith('--')) {
      words.push(arg);
      continue;
    }
    const equal = arg.indexOf('=');
    if (equal >= 0) {
      flags.push({ name: arg.slice(2, equal), value: arg.slice(equal + 1) });
      continue;
    }
    const name = arg.slice(2);
    // 布尔选项无需值，避免把后续命令名吞作选项值。
    if (
      ['help', 'version', 'json', 'wait', 'rerank', 'query-extension'].includes(name) ||
      name.startsWith('no-')
    ) {
      flags.push({ name });
      continue;
    }
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags.push({ name, value: next });
      i++;
    } else flags.push({ name });
  }
  return { command: words.join(' '), flags };
};

/** 从联合请求结构中查找参数；每个路径段都必须由公开 Schema 声明。 */
const findSchemas = (schema: InputSchema, path: string[]): InputSchema[] => {
  if (path.length === 0)
    return [
      schema,
      ...[...(schema.anyOf ?? []), ...(schema.oneOf ?? []), ...(schema.allOf ?? [])].flatMap(
        (branch) => findSchemas(branch, [])
      )
    ];
  const [head, ...tail] = path;
  return [
    ...(schema.properties?.[head] ? findSchemas(schema.properties[head], tail) : []),
    ...[...(schema.anyOf ?? []), ...(schema.oneOf ?? []), ...(schema.allOf ?? [])].flatMap(
      (branch) => findSchemas(branch, path)
    )
  ];
};

/** 安全设置嵌套对象；拒绝原型链键，数组参数支持重复传入。 */
const setValue = (
  input: Record<string, unknown>,
  path: string[],
  value: unknown,
  append: boolean
) => {
  let target = input;
  for (const key of path) {
    if (['__proto__', 'prototype', 'constructor'].includes(key))
      throw new TypeError('Invalid option path');
  }
  for (const key of path.slice(0, -1)) {
    const old = target[key];
    if (old === undefined) target[key] = {};
    else if (old === null || typeof old !== 'object' || Array.isArray(old))
      throw new TypeError('Conflicting nested options');
    target = target[key] as Record<string, unknown>;
  }
  const key = path.at(-1)!;
  target[key] =
    append && Array.isArray(target[key]) ? [...target[key], ...(value as unknown[])] : value;
};

/** 使用生成的契约解析 CLI 选项，避免把数字、布尔值、数组都当成字符串传入。 */
export const buildInput = (operation: DatasetOperation, flags: CliFlag[], base: unknown = {}) => {
  if (!base || typeof base !== 'object' || Array.isArray(base))
    throw new TypeError('Input must be a JSON object');
  const input = structuredClone(base) as Record<string, unknown>;
  const schema = datasetInputSchemas[operation] as InputSchema;
  const searchAliases: Record<string, string> = {
    'dataset-id': 'scope.datasetIds',
    'dataset-ids': 'scope.datasetIds',
    text: 'query.text',
    'image-key': 'query.imageKeys',
    'image-keys': 'query.imageKeys',
    mode: 'retrieval.mode',
    'embedding-weight': 'retrieval.embeddingWeight',
    'max-tokens': 'result.maxTokens',
    similarity: 'result.similarity',
    rerank: 'rerank.enabled',
    'rerank-model-id': 'rerank.modelId',
    'rerank-weight': 'rerank.weight',
    'query-extension': 'queryExtension.enabled',
    'extension-model-id': 'queryExtension.modelId',
    'extension-background': 'queryExtension.background'
  };
  for (const flag of flags) {
    const negative = flag.name.startsWith('no-');
    const name = negative ? flag.name.slice(3) : flag.name;
    const field = operation === 'search' && searchAliases[name] ? searchAliases[name] : name;
    const path = field
      .split('.')
      .map((segment) => segment.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase()));
    const candidates = findSchemas(schema, path);
    if (!candidates.length) throw new TypeError(`Unknown option: --${flag.name}`);
    const types = candidates.flatMap((candidate) =>
      typeof candidate.type === 'string' ? [candidate.type] : (candidate.type ?? [])
    );
    let value: unknown;
    if (
      types.includes('boolean') ||
      (candidates.some((item) => 'const' in item) && flag.value === undefined)
    ) {
      if (flag.value !== undefined && !['true', 'false'].includes(flag.value))
        throw new TypeError(`--${flag.name} expects true or false`);
      value = negative ? false : flag.value === undefined || flag.value === 'true';
    } else {
      if (negative || flag.value === undefined)
        throw new TypeError(`--${flag.name} requires a value`);
      if (types.includes('array')) {
        value = flag.value.startsWith('[') ? JSON.parse(flag.value) : flag.value.split(',');
      } else if (types.includes('integer') || types.includes('number')) {
        value = Number(flag.value);
        if (!Number.isFinite(value)) throw new TypeError(`--${flag.name} expects a number`);
      } else if (types.includes('object')) value = JSON.parse(flag.value);
      else if (flag.value === 'null' && types.includes('null')) value = null;
      else value = flag.value;
    }
    setValue(input, path, value, types.includes('array'));
  }
  const ajv = new Ajv2020({
    strict: false,
    allErrors: true,
    validateFormats: false,
    useDefaults: true
  });
  if (!ajv.validate(datasetInputSchemas[operation], input)) {
    const errors = (ajv.errors ?? [])
      .slice(0, 5)
      .map((error) => `${error.instancePath || '/'} ${error.message}`)
      .join('; ');
    throw new TypeError(`Invalid input: ${errors}`);
  }
  return input;
};
