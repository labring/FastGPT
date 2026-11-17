import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRequire, registerHooks } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const DOCUMENT_ROOT = path.resolve(SCRIPT_DIR, '..');
export const REPO_ROOT = path.resolve(DOCUMENT_ROOT, '..');

const GLOBAL_ROOT = path.join(REPO_ROOT, 'packages', 'global');
const TRANSLATIONS_PATH = path.join(DOCUMENT_ROOT, 'data', 'openapi', 'en-translations.json');
const ZH_SPEC_PATH = path.join(DOCUMENT_ROOT, 'data', 'openapi', 'systemopenapi.zh-CN.json');
const EN_SPEC_PATH = path.join(DOCUMENT_ROOT, 'data', 'openapi', 'systemopenapi.en.json');
const REFERENCE_CONTENT_DIR = path.join(DOCUMENT_ROOT, 'content', 'openapi', 'reference');
const OPENAPI_META_ZH_PATH = path.join(DOCUMENT_ROOT, 'content', 'openapi', 'meta.json');
const OPENAPI_META_EN_PATH = path.join(DOCUMENT_ROOT, 'content', 'openapi', 'meta.en.json');
const DOC_LAST_MODIFIED_PATH = path.join(DOCUMENT_ROOT, 'data', 'doc-last-modified.json');

const HAN_REGEX = /\p{Script=Han}/u;
const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace'] as const;
const LOADER_GUARD_KEY = Symbol.for('fastgpt.document.openapiSyncLoaderRegistered');

export const MODULE_ORDER = [
  'model',
  'app-log',
  'chat-controller',
  'chat-history',
  'chat-record',
  'chat-feedback',
  'dataset',
  'dataset-collection',
  'dataset-collection-create',
  'dataset-data',
  'dataset-search'
] as const;

export type OpenApiLocale = 'zh-CN' | 'en';
export type HttpMethodLower = (typeof HTTP_METHODS)[number];

type JsonObject = Record<string, unknown>;
type SchemaObject = Record<string, unknown>;

type TranslationModuleEntry = {
  zhTitle: string;
  enTitle: string;
  zhTag: string;
  enTag: string;
  zhGroup: string;
  enGroup: string;
};

type TranslationOperationLocale = {
  title: string;
  seoTitle: string;
  description: string;
};

type TranslationOperationEntry = {
  module: string;
  slug: string;
  zh: TranslationOperationLocale;
  en: TranslationOperationLocale;
};

type TranslationHashEntry = {
  zh: string;
  en: string;
};

type TranslationDictionary = {
  version: number;
  tagGroups: Record<string, string>;
  modules: Record<string, TranslationModuleEntry>;
  operations: Record<string, TranslationOperationEntry>;
  hashes: Record<string, TranslationHashEntry>;
  operationHashOverrides?: Record<string, Record<string, TranslationHashEntry>>;
};

type CompletionExampleEntry = {
  summary: string;
  description: string;
  value: unknown;
};

type CompletionEventEntry = {
  name: string;
  label: string;
  description: string;
  value: string;
};

type CompletionResponseExamplesBundle = {
  json: Record<string, CompletionExampleEntry>;
  sse: Record<string, CompletionExampleEntry>;
  events: CompletionEventEntry[];
};

type GeneratedArtifact = {
  relativePath: string;
  content: string;
};

export type GeneratedOperationPage = {
  opKey: string;
  method: string;
  apiPath: string;
  module: string;
  slug: string;
  urlSlug: string;
  deprecated: boolean;
  zhPath: string;
  enPath: string;
  zhContent: string;
  enContent: string;
};

export type GeneratedOpenApiDocsBundle = {
  zhSpecJson: string;
  enSpecJson: string;
  openapiMetaZhJson: string;
  openapiMetaEnJson: string;
  referenceMetaZhJson: string;
  referenceMetaEnJson: string;
  moduleMetas: GeneratedArtifact[];
  pages: GeneratedOperationPage[];
  lockedSlugs: string[];
};

type UnionParameterMeta = {
  label?: string;
  position?: string;
};

type FlattenedProperty = {
  name: string;
  schema: SchemaObject;
  required: boolean;
  unionLabel?: string;
};

type ExtractedUnionGroup = {
  branches: SchemaObject[];
  keyword: 'anyOf' | 'oneOf';
};

type DecomposedObjectSchema = {
  properties: Map<string, FlattenedProperty>;
  unions: ExtractedUnionGroup[];
};

type MissingTranslationItem = {
  hash: string;
  zh: string;
  path: string;
  opKey?: string;
};

const documentRequire = createRequire(path.join(DOCUMENT_ROOT, 'package.json'));
const rootRequire = createRequire(path.join(REPO_ROOT, 'package.json'));

const isPlainObject = (value: unknown): value is JsonObject =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const sha256 = (value: string): string =>
  crypto.createHash('sha256').update(value, 'utf8').digest('hex');

const toPosixRelative = (fromDir: string, targetPath: string): string =>
  path.relative(fromDir, targetPath).split(path.sep).join('/');

/** 注册 Node ESM 钩子，使 `@fastgpt/global/*` 及其内部无扩展名 TS/TSX 导入可在 Node 原生运行。 */
const ensureFastgptGlobalLoader = () => {
  const globalStore = globalThis as Record<symbol, boolean | undefined>;
  if (globalStore[LOADER_GUARD_KEY] === true) return;
  globalStore[LOADER_GUARD_KEY] = true;

  const ts = documentRequire('typescript') as typeof import('typescript');
  const tryResolveFile = (basePath: string): string | null => {
    const candidates = [
      basePath,
      `${basePath}.ts`,
      `${basePath}.tsx`,
      `${basePath}.mts`,
      `${basePath}.js`,
      `${basePath}.mjs`,
      path.join(basePath, 'index.ts'),
      path.join(basePath, 'index.tsx'),
      path.join(basePath, 'index.js')
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return pathToFileURL(candidate).href;
      }
    }
    return null;
  };

  const globalRootUrl = pathToFileURL(GLOBAL_ROOT).href;
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier.startsWith('@fastgpt/global/')) {
        const subPath = specifier.slice('@fastgpt/global/'.length);
        const target = tryResolveFile(path.join(GLOBAL_ROOT, subPath));
        if (target !== null) {
          return { shortCircuit: true, url: target };
        }
      }
      if (
        (specifier.startsWith('./') || specifier.startsWith('../')) &&
        context.parentURL !== undefined &&
        context.parentURL.startsWith('file://')
      ) {
        const parentDir = path.dirname(fileURLToPath(context.parentURL));
        if (parentDir.startsWith(GLOBAL_ROOT)) {
          const target = tryResolveFile(path.resolve(parentDir, specifier));
          if (target !== null) {
            return { shortCircuit: true, url: target };
          }
        }
      }
      return nextResolve(specifier, context);
    },
    load(url, context, nextLoad) {
      if (url.startsWith(globalRootUrl) && /\.(?:ts|tsx)$/.test(url)) {
        const filePath = fileURLToPath(url);
        const source = fs.readFileSync(filePath, 'utf8');
        const { outputText } = ts.transpileModule(source, {
          fileName: filePath,
          compilerOptions: {
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2022,
            jsx: ts.JsxEmit.ReactJSX,
            esModuleInterop: true
          }
        });
        return { shortCircuit: true, format: 'module', source: outputText };
      }
      return nextLoad(url, context);
    }
  });
};

const MODULE_PATH_PREFIXES: Record<string, string[]> = {
  model: ['/core/ai/model/'],
  'app-log': ['/proApi/core/app/logs/', '/core/app/logs/'],
  'chat-controller': ['/'],
  'chat-history': ['/core/chat/history/', '/core/chat/'],
  'chat-record': ['/core/chat/record/'],
  'chat-feedback': ['/core/chat/feedback/'],
  dataset: ['/core/dataset/'],
  'dataset-collection': ['/core/dataset/collection/'],
  'dataset-collection-create': ['/core/dataset/collection/create/', '/core/dataset/collection/'],
  'dataset-data': ['/core/dataset/data/'],
  'dataset-search': ['/core/dataset/']
};

const toKebabCase = (input: string): string =>
  input
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .replace(/[_\s/]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

/** 根据 Operation 扩展声明或路径前缀规则，确定性推导 kebab-case URL slug。 */
const deriveOperationBaseSlug = (params: {
  module: string;
  apiPath: string;
  operation: SchemaObject;
}): string => {
  const { module, apiPath, operation } = params;
  const explicit =
    typeof operation['x-doc-slug'] === 'string' && operation['x-doc-slug'].trim().length > 0
      ? operation['x-doc-slug'].trim()
      : typeof operation.operationId === 'string' && operation.operationId.trim().length > 0
        ? operation.operationId.trim()
        : undefined;
  if (explicit !== undefined) {
    return toKebabCase(explicit);
  }

  const prefixes = MODULE_PATH_PREFIXES[module] ?? ['/'];
  let trimmed = apiPath;
  for (const prefix of prefixes) {
    if (apiPath.startsWith(prefix)) {
      trimmed = apiPath.slice(prefix.length);
      break;
    }
  }
  const fallback = apiPath.split('/').filter(Boolean).at(-1) ?? 'operation';
  return toKebabCase(trimmed.length > 0 ? trimmed : fallback);
};

/** 收集全部现有非 reference 文档的标题与描述，防止跨目录撞车。 */
const collectExistingPageMetadata = () => {
  const matter = documentRequire('gray-matter') as typeof import('gray-matter');
  const contentRoot = path.join(DOCUMENT_ROOT, 'content');
  const zhTitles = new Map<string, string>();
  const enTitles = new Map<string, string>();
  const zhDescriptions = new Map<string, string>();
  const enDescriptions = new Map<string, string>();

  for (const entry of fs.readdirSync(contentRoot, { recursive: true })) {
    const rel = String(entry).split(path.sep).join('/');
    if (!rel.endsWith('.mdx') || rel.startsWith('openapi/reference/')) continue;
    if (/^toc(?:\.en)?\.mdx$/.test(rel)) continue;
    if (
      rel === 'guide/chat/htmlRendering.mdx' ||
      rel === 'guide/chat/htmlRendering.en.mdx' ||
      rel === 'guide/dataset/collection_tags_legacy.mdx' ||
      rel === 'guide/dataset/collection_tags_legacy.en.mdx' ||
      rel === 'faq/chat.mdx' ||
      rel === 'faq/chat.en.mdx'
    ) {
      continue;
    }

    const { data } = matter(fs.readFileSync(path.join(contentRoot, rel), 'utf8'));
    const title = String(data.title ?? '').trim();
    const desc = String(data.description ?? '').trim();
    if (rel.endsWith('.en.mdx')) {
      if (title.length > 0) enTitles.set(title, rel);
      if (desc.length > 0) enDescriptions.set(desc, rel);
    } else {
      if (title.length > 0) zhTitles.set(title, rel);
      if (desc.length > 0) zhDescriptions.set(desc, rel);
    }
  }

  return { zhTitles, enTitles, zhDescriptions, enDescriptions };
};

/** 递归翻译 OpenAPI 文档与示例中的所有含汉字字符串，并收集缺失译文以便一次性报错。 */
const translateNodeToEnglish = (params: {
  value: unknown;
  nodePath: string;
  opKey?: string;
  dictionary: TranslationDictionary;
  missing: MissingTranslationItem[];
}): unknown => {
  const { value, nodePath, opKey, dictionary, missing } = params;
  if (typeof value === 'string') {
    if (!HAN_REGEX.test(value)) return value;
    const hash = sha256(value);
    const override =
      opKey !== undefined ? dictionary.operationHashOverrides?.[opKey]?.[hash] : undefined;
    const translated = override ?? dictionary.hashes[hash];
    if (translated === undefined || translated.en.trim().length === 0) {
      missing.push({ hash, zh: value, path: nodePath, opKey });
      return value;
    }
    return translated.en;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      translateNodeToEnglish({
        value: item,
        nodePath: `${nodePath}[${index}]`,
        opKey,
        dictionary,
        missing
      })
    );
  }
  if (isPlainObject(value)) {
    const next: JsonObject = {};
    for (const [key, item] of Object.entries(value)) {
      if (nodePath === 'doc' && key === 'servers') {
        next[key] = item;
        continue;
      }
      const nextOpKey = (() => {
        if (nodePath.startsWith('doc.paths.')) {
          const match = nodePath.match(/^doc\.paths\.(.+?)\.([a-z]+)$/);
          if (match !== null && (HTTP_METHODS as readonly string[]).includes(match[2])) {
            return `${match[2].toUpperCase()} ${match[1]}`;
          }
        }
        return opKey;
      })();
      next[key] = translateNodeToEnglish({
        value: item,
        nodePath: `${nodePath}.${key}`,
        opKey: nextOpKey,
        dictionary,
        missing
      });
    }
    return next;
  }
  return value;
};

/** 递归查找含汉字字段的辅助翻译，用于精确注入 opKey 上下文后再调用 translateNodeToEnglish。 */
const translateDocumentToEnglish = (params: {
  document: SchemaObject;
  dictionary: TranslationDictionary;
  missing: MissingTranslationItem[];
}): SchemaObject => {
  const { document, dictionary, missing } = params;
  const cloned = structuredClone(document);

  // 1. 翻译顶层 info 与 x-tagGroups。
  if (cloned.info !== undefined) {
    cloned.info = translateNodeToEnglish({
      value: cloned.info,
      nodePath: 'doc.info',
      dictionary,
      missing
    });
  }
  if (cloned['x-tagGroups'] !== undefined) {
    cloned['x-tagGroups'] = translateNodeToEnglish({
      value: cloned['x-tagGroups'],
      nodePath: 'doc.x-tagGroups',
      dictionary,
      missing
    });
  }

  // 2. 按 operation 粒度翻译 paths，保留精确的 opKey 以便支持 operationHashOverrides。
  if (isPlainObject(cloned.paths)) {
    const nextPaths: JsonObject = {};
    for (const [apiPath, pathItem] of Object.entries(cloned.paths)) {
      if (!isPlainObject(pathItem)) {
        nextPaths[apiPath] = pathItem;
        continue;
      }
      const nextPathItem: JsonObject = {};
      for (const [method, operation] of Object.entries(pathItem)) {
        const opKey = (HTTP_METHODS as readonly string[]).includes(method)
          ? `${method.toUpperCase()} ${apiPath}`
          : undefined;
        nextPathItem[method] = translateNodeToEnglish({
          value: operation,
          nodePath: `doc.paths.${apiPath}.${method}`,
          opKey,
          dictionary,
          missing
        });
      }
      nextPaths[apiPath] = nextPathItem;
    }
    cloned.paths = nextPaths;
  }

  // 3. 翻译其余顶层字段（components 等）。
  for (const [key, item] of Object.entries(cloned)) {
    if (['info', 'x-tagGroups', 'paths', 'servers'].includes(key)) continue;
    cloned[key] = translateNodeToEnglish({
      value: item,
      nodePath: `doc.${key}`,
      dictionary,
      missing
    });
  }

  cloned.servers = [
    { url: 'https://cloud.fastgpt.io/api', description: 'FastGPT International Cloud' },
    { url: '/api', description: 'Self-hosted instance relative path' }
  ];

  return cloned;
};

/** 剥离运行时随机生成的 nanoid 默认值（如 chatId、responseChatItemId、planId、steps[].id），确保跨进程同步幂等。 */
const stabilizeNonDeterministicDefaults = (node: unknown, propPath = ''): void => {
  if (Array.isArray(node)) {
    node.forEach((item) => stabilizeNonDeterministicDefaults(item, propPath));
    return;
  }
  if (!isPlainObject(node)) return;

  const effectivePath =
    typeof node.name === 'string' && 'in' in node
      ? propPath
        ? `${propPath}.${node.name}`
        : node.name
      : propPath;
  const leafName = effectivePath.split('.').pop() ?? '';
  const isDynamicIdField =
    leafName === 'chatId' ||
    leafName === 'responseChatItemId' ||
    leafName === 'planId' ||
    effectivePath === 'steps.id' ||
    effectivePath.endsWith('.steps.id');

  if (
    isDynamicIdField &&
    typeof node.default === 'string' &&
    /^[a-zA-Z0-9_-]{6,32}$/.test(node.default) &&
    node.default !== leafName
  ) {
    delete node.default;
  }

  for (const [key, value] of Object.entries(node)) {
    if (key === 'properties' && isPlainObject(value)) {
      for (const [childProp, childSchema] of Object.entries(value)) {
        const childPath = effectivePath ? `${effectivePath}.${childProp}` : childProp;
        stabilizeNonDeterministicDefaults(childSchema, childPath);
      }
      continue;
    }
    const nextPath =
      key === 'allOf' || key === 'anyOf' || key === 'oneOf' || key === 'schema' || key === 'items'
        ? effectivePath
        : '';
    stabilizeNonDeterministicDefaults(value, nextPath);
  }
};

/** 保护带点号或精确字段名的代码标识（如 `query.id`、`body.id`、`提供 id`），避免被 textlint 误改为 `.ID`。 */
const protectCodeIdentifiers = (segment: string): string =>
  segment
    .replace(
      /(?<![`/\w])((?:body|query|data|params|result|scope|meta|publishSource|outLinkAuthData)\.[a-zA-Z_][\w.]*)(?![`\w])/g,
      '`$1`'
    )
    .replace(/(?<=(?:提供|by)\s+)(id)(?=\b)/gi, '`$1`');

/** 剥离纯注释/表格外文本中的 MDX 语法危险字符（保留代码块与行内代码及 Markdown 链接）。 */
const escapeMdxPlainSegment = (segment: string): string => {
  const linkParts = segment.split(/(\[[^\]]+\]\([^)]+\))/g);
  return linkParts
    .map((part, idx) => {
      if (idx % 2 === 1) return part;
      const lines = protectCodeIdentifiers(part).split('\n');
      return lines
        .map((line) => {
          const quoteMatch = line.match(/^(\s*(?:>\s*)+)(.*)$/);
          const prefix = quoteMatch?.[1] ?? '';
          const rest = quoteMatch !== null ? quoteMatch[2] : line;
          const innerParts = rest.split(/(`[^`\n]*`)/g);
          const escaped = innerParts
            .map((inner, innerIdx) => {
              if (innerIdx % 2 === 1) return inner;
              return inner
                .replace(/\\([{}\\<>])/g, '$1')
                .replace(/\{/g, '\\{')
                .replace(/\}/g, '\\}')
                .replace(/</g, '\\<')
                .replace(/>/g, '\\>');
            })
            .join('');
          return `${prefix}${escaped}`;
        })
        .join('\n');
    })
    .join('');
};

/** 对含 Markdown 的长描述做 MDX 安全转义，不破坏 fenced code 与 inline code。 */
const sanitizeMdxProse = (text: string): string => {
  const fenceParts = text.split(/(```[\s\S]*?```)/g);
  return fenceParts
    .map((fencePart, fenceIndex) => {
      if (fenceIndex % 2 === 1) return fencePart;
      const inlineParts = fencePart.split(/(`[^`\n]*`)/g);
      return inlineParts
        .map((inlinePart, inlineIndex) =>
          inlineIndex % 2 === 1 ? inlinePart : escapeMdxPlainSegment(inlinePart)
        )
        .join('');
    })
    .join('');
};

/** 对 GFM 表格单元格做单行化及 `|` / MDX 字符安全转义。 */
const sanitizeTableCell = (text: string): string => {
  const singleLine = text.replace(/\r?\n+/g, ' ').replace(/\s+/g, ' ').trim();
  if (singleLine.length === 0) return '-';
  const inlineParts = singleLine.split(/(`[^`\n]*`)/g);
  return inlineParts
    .map((part, index) => {
      if (index % 2 === 1) {
        return part.replace(/(?<!\\)\|/g, '\\|');
      }
      const protectedText = protectCodeIdentifiers(part);
      const subParts = protectedText.split(/(`[^`\n]*`)/g);
      return subParts
        .map((sub, subIdx) => {
          if (subIdx % 2 === 1) return sub.replace(/(?<!\\)\|/g, '\\|');
          return sub
            .replace(/\\([{}\\<>|])/g, '$1')
            .replace(/\|/g, '\\|')
            .replace(/\{/g, '\\{')
            .replace(/\}/g, '\\}')
            .replace(/</g, '\\<')
            .replace(/>/g, '\\>');
        })
        .join('');
    })
    .join('');
};

/** 解析并剥离 `prepareOpenApiUnionPresentation` 包装的单元素 `allOf` 与标记。 */
const unwrapPropertySchema = (
  raw: unknown
): { schema: SchemaObject; unionLabel?: string } => {
  if (!isPlainObject(raw)) {
    return { schema: {} };
  }
  const unionParam = isPlainObject(raw['x-fastgpt-union-parameter'])
    ? (raw['x-fastgpt-union-parameter'] as UnionParameterMeta)
    : undefined;
  const unionGroup = isPlainObject(raw['x-fastgpt-union-group'])
    ? (raw['x-fastgpt-union-group'] as { label?: string })
    : undefined;
  const unionLabel =
    typeof unionParam?.label === 'string' && unionParam.label.trim().length > 0
      ? unionParam.label.trim()
      : typeof unionGroup?.label === 'string' && unionGroup.label.trim().length > 0
        ? unionGroup.label.trim()
        : undefined;

  if (
    unionParam !== undefined &&
    Array.isArray(raw.allOf) &&
    raw.allOf.length === 1 &&
    isPlainObject(raw.allOf[0])
  ) {
    const inner = unwrapPropertySchema(raw.allOf[0]);
    return {
      schema: inner.schema,
      unionLabel: unionLabel ?? inner.unionLabel
    };
  }

  if (Array.isArray(raw.allOf) && raw.allOf.length === 1 && isPlainObject(raw.allOf[0])) {
    const { allOf: _allOf, ...siblings } = raw;
    const inner = unwrapPropertySchema(raw.allOf[0]);
    return {
      schema: { ...inner.schema, ...siblings },
      unionLabel: unionLabel ?? inner.unionLabel
    };
  }

  return { schema: raw, unionLabel };
};

/** 计算 schema 的标准化结构签名，用于公共字段提取、相同分支去重与防环判断。 */
const computeSchemaSignature = (value: unknown): string => {
  const normalize = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(normalize);
    if (!isPlainObject(node)) return node;
    return Object.fromEntries(
      Object.keys(node)
        .filter((key) => key !== 'x-fastgpt-union-parameter' && key !== 'x-fastgpt-union-layout')
        .sort()
        .map((key) => [key, normalize(node[key])])
    );
  };
  return JSON.stringify(normalize(value));
};

/** 判断 Schema 是否包含对象属性或对象分支（区分纯标量/可空联合类型）。 */
const isObjectSchemaNode = (raw: unknown): boolean => {
  const { schema } = unwrapPropertySchema(raw);
  if (schema.type === 'object' || isPlainObject(schema.properties)) return true;
  for (const kw of ['allOf', 'anyOf', 'oneOf'] as const) {
    const arr = schema[kw];
    if (Array.isArray(arr) && arr.length > 0 && arr.every((item) => isObjectSchemaNode(item))) {
      return true;
    }
  }
  return false;
};

/** 递归合并对象及其 `allOf`，同时分离保留对象级的 `anyOf` / `oneOf` 互斥分支组。 */
const decomposeObjectSchema = (raw: unknown): DecomposedObjectSchema => {
  const { schema } = unwrapPropertySchema(raw);
  const properties = new Map<string, FlattenedProperty>();
  const required = new Set<string>(
    Array.isArray(schema.required)
      ? schema.required.filter((item): item is string => typeof item === 'string')
      : []
  );
  const unions: ExtractedUnionGroup[] = [];

  if (isPlainObject(schema.properties)) {
    for (const [name, propValue] of Object.entries(schema.properties)) {
      if (propValue === false) continue;
      const unwrapped = unwrapPropertySchema(propValue);
      properties.set(name, {
        name,
        schema: unwrapped.schema,
        required: required.has(name),
        unionLabel: unwrapped.unionLabel
      });
    }
  }

  if (Array.isArray(schema.allOf)) {
    for (const part of schema.allOf) {
      if (!isPlainObject(part)) continue;
      const sub = decomposeObjectSchema(part);
      for (const [name, prop] of sub.properties) {
        const existing = properties.get(name);
        properties.set(name, {
          name,
          schema: existing !== undefined ? { ...existing.schema, ...prop.schema } : prop.schema,
          required: (existing?.required ?? false) || prop.required || required.has(name),
          unionLabel: prop.unionLabel ?? existing?.unionLabel
        });
      }
      for (const union of sub.unions) {
        unions.push(union);
      }
    }
  }

  for (const kw of ['anyOf', 'oneOf'] as const) {
    const branches = schema[kw];
    if (Array.isArray(branches) && branches.length > 0 && isObjectSchemaNode(schema)) {
      const resolvedBranches = branches.filter((item): item is SchemaObject => isPlainObject(item));
      if (resolvedBranches.length > 0) {
        unions.push({ keyword: kw, branches: resolvedBranches });
      }
    }
  }

  for (const name of required) {
    const prop = properties.get(name);
    if (prop !== undefined) prop.required = true;
  }

  return { properties, unions };
};

/** 格式化字段类型展示文本（含枚举、数组元素类型与标量联合类型）。 */
const formatSchemaType = (raw: unknown, locale: OpenApiLocale): string => {
  const { schema } = unwrapPropertySchema(raw);
  if (schema.const !== undefined) {
    return `\`${JSON.stringify(schema.const)}\``;
  }
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    const baseType = typeof schema.type === 'string' ? schema.type : 'enum';
    return `\`${baseType}\` (enum)`;
  }
  for (const kw of ['anyOf', 'oneOf'] as const) {
    const choices = schema[kw];
    if (Array.isArray(choices) && choices.length > 0 && !isObjectSchemaNode(schema)) {
      const parts = choices.map((choice) => {
        const inner = unwrapPropertySchema(choice).schema;
        if (inner.const !== undefined) return JSON.stringify(inner.const);
        if (Array.isArray(inner.type)) return inner.type.join(' | ');
        if (typeof inner.type === 'string') return inner.type;
        if (isPlainObject(inner.properties)) return 'object';
        return 'unknown';
      });
      return `\`${[...new Set(parts)].join(' | ')}\``;
    }
  }
  if (schema.type === 'array') {
    const itemType = isPlainObject(schema.items)
      ? formatSchemaType(schema.items, locale).replace(/^`|`$/g, '')
      : 'unknown';
    return `\`${itemType}[]\``;
  }
  if (Array.isArray(schema.type)) {
    return `\`${schema.type.join(' | ')}\``;
  }
  if (typeof schema.type === 'string') {
    return schema.format === 'binary'
      ? locale === 'en'
        ? '`binary` (file)'
        : '`binary`（文件）'
      : `\`${schema.type}\``;
  }
  if (isPlainObject(schema.properties) || isObjectSchemaNode(schema)) {
    return '`object`';
  }
  return '`any`';
};

/** 格式化默认值或示例为紧凑文本。 */
const formatDefaultValue = (schema: SchemaObject): string => {
  if (schema.default === undefined) return '-';
  const serialized = JSON.stringify(schema.default);
  if (serialized.length > 48) return `\`${serialized.slice(0, 45)}...\``;
  return `\`${serialized}\``;
};

/** 构造字段表格的约束与说明列文本。 */
const formatFieldConstraintsAndDescription = (params: {
  prop: FlattenedProperty;
  locale: OpenApiLocale;
}): string => {
  const { prop, locale } = params;
  const { schema, unionLabel } = prop;
  const isEn = locale === 'en';
  const parts: string[] = [];

  if (schema.deprecated === true) {
    parts.push(isEn ? '**Deprecated**.' : '**已弃用**。');
  }
  if (unionLabel !== undefined) {
    parts.push(
      isEn ? `**Mutually Exclusive Group: ${unionLabel}**.` : `**互斥参数组：${unionLabel}**。`
    );
  }
  if (typeof schema.description === 'string' && schema.description.trim().length > 0) {
    parts.push(schema.description.trim());
  }

  const constraints: string[] = [];
  if (schema.const !== undefined) {
    constraints.push(
      isEn ? `Fixed: \`${JSON.stringify(schema.const)}\`` : `固定值：\`${JSON.stringify(schema.const)}\``
    );
  }
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    const enumDescs = isPlainObject(schema['x-enumDescriptions'])
      ? (schema['x-enumDescriptions'] as Record<string, string>)
      : undefined;
    const formattedValues = schema.enum.slice(0, 20).map((val) => {
      const desc = enumDescs?.[String(val)];
      const codeVal = `\`${String(val)}\``;
      return typeof desc === 'string' && desc.trim().length > 0 ? `${codeVal} (${desc.trim()})` : codeVal;
    });
    const suffix = schema.enum.length > 20 ? (isEn ? ' ...' : ' 等') : '';
    constraints.push(
      (isEn ? 'Allowed values: ' : '可选值：') + formattedValues.join(', ') + suffix
    );
  }
  if (typeof schema.minLength === 'number') {
    constraints.push(isEn ? `minLength: ${schema.minLength}` : `最小长度：${schema.minLength}`);
  }
  if (typeof schema.maxLength === 'number') {
    constraints.push(isEn ? `maxLength: ${schema.maxLength}` : `最大长度：${schema.maxLength}`);
  }
  if (typeof schema.minimum === 'number') {
    constraints.push(isEn ? `min: ${schema.minimum}` : `最小值：${schema.minimum}`);
  }
  if (typeof schema.maximum === 'number') {
    constraints.push(isEn ? `max: ${schema.maximum}` : `最大值：${schema.maximum}`);
  }
  if (typeof schema.minItems === 'number') {
    constraints.push(isEn ? `minItems: ${schema.minItems}` : `最少项数：${schema.minItems}`);
  }
  if (typeof schema.maxItems === 'number') {
    constraints.push(isEn ? `maxItems: ${schema.maxItems}` : `最多项数：${schema.maxItems}`);
  }
  if (typeof schema.pattern === 'string') {
    constraints.push(isEn ? `pattern: \`${schema.pattern}\`` : `正则：\`${schema.pattern}\``);
  }

  if (constraints.length > 0) {
    const constraintSep = isEn ? '; ' : '；';
    const constraintText = constraints.join(constraintSep);
    const lastPart = parts.at(-1);
    if (lastPart !== undefined && !/[。.;；!?！？]$/.test(lastPart)) {
      parts[parts.length - 1] = `${lastPart}${isEn ? '.' : '。'}`;
    }
    parts.push(constraintText);
  }

  return sanitizeTableCell(parts.join(' '));
};

type RenderedRow = {
  fieldPath: string;
  prop: FlattenedProperty;
};

/** 递归展开属性表行（展开嵌套 object 与 object[]，并通过签名集合防止循环展开）。 */
const collectTableRows = (params: {
  properties: Map<string, FlattenedProperty>;
  prefix: string;
  depth: number;
  maxDepth: number;
  visitedSignatures: Set<string>;
}): RenderedRow[] => {
  const { properties, prefix, depth, maxDepth, visitedSignatures } = params;
  const rows: RenderedRow[] = [];

  for (const prop of properties.values()) {
    const fieldPath = prefix.length > 0 ? `${prefix}.${prop.name}` : prop.name;
    rows.push({ fieldPath, prop });

    if (depth >= maxDepth) continue;

    const { schema } = prop;
    const sig = computeSchemaSignature(schema);
    if (visitedSignatures.has(sig)) continue;

    if (schema.type === 'object' || isPlainObject(schema.properties) || Array.isArray(schema.allOf)) {
      const nested = decomposeObjectSchema(schema);
      if (nested.properties.size > 0) {
        const nextVisited = new Set(visitedSignatures).add(sig);
        rows.push(
          ...collectTableRows({
            properties: nested.properties,
            prefix: fieldPath,
            depth: depth + 1,
            maxDepth,
            visitedSignatures: nextVisited
          })
        );
      }
    } else if (schema.type === 'array' && isPlainObject(schema.items)) {
      const itemSig = computeSchemaSignature(schema.items);
      if (!visitedSignatures.has(itemSig)) {
        const nested = decomposeObjectSchema(schema.items);
        if (nested.properties.size > 0) {
          const nextVisited = new Set(visitedSignatures).add(sig).add(itemSig);
          rows.push(
            ...collectTableRows({
              properties: nested.properties,
              prefix: `${fieldPath}[]`,
              depth: depth + 1,
              maxDepth,
              visitedSignatures: nextVisited
            })
          );
        }
      }
    }
  }

  return rows;
};

/** 渲染 GFM 字段参数表。 */
const renderPropertiesTable = (params: {
  properties: Map<string, FlattenedProperty>;
  locale: OpenApiLocale;
  maxDepth?: number;
}): string => {
  const { properties, locale, maxDepth = 3 } = params;
  const isEn = locale === 'en';
  const rows = collectTableRows({
    properties,
    prefix: '',
    depth: 0,
    maxDepth,
    visitedSignatures: new Set()
  });

  if (rows.length === 0) return '';

  const header = isEn
    ? '| Field | Type | Required | Default | Constraints & Description |\n| --- | --- | --- | --- | --- |'
    : '| 字段 | 类型 | 必填 | 默认值 | 约束与说明 |\n| --- | --- | --- | --- | --- |';

  const body = rows.map(({ fieldPath, prop }) => {
    const reqText = prop.required ? (isEn ? 'Yes' : '是') : isEn ? 'No' : '否';
    const typeText = sanitizeTableCell(formatSchemaType(prop.schema, locale));
    const defaultText = sanitizeTableCell(formatDefaultValue(prop.schema));
    const descText = formatFieldConstraintsAndDescription({ prop, locale });
    return `| \`${fieldPath}\` | ${typeText} | ${reqText} | ${defaultText} | ${descText} |`;
  });

  return `${header}\n${body.join('\n')}`;
};

/** 收集对象分支及其嵌套互斥子分支中所有恒定存在的公共属性（用于跨层去重，避免 `messages` 等大字段重复渲染）。 */
const collectInvariantProperties = (raw: unknown): Map<string, FlattenedProperty> => {
  const decomposed = decomposeObjectSchema(raw);
  const result = new Map<string, FlattenedProperty>(decomposed.properties);

  for (const union of decomposed.unions) {
    if (union.branches.length === 0) continue;
    const subMaps = union.branches.map((branch) => collectInvariantProperties(branch));
    for (const [key, firstProp] of subMaps[0]) {
      if (firstProp.unionLabel !== undefined) continue;
      const firstSig = computeSchemaSignature(firstProp.schema);
      const presentInAll = subMaps.every((m) => {
        const candidate = m.get(key);
        return (
          candidate !== undefined &&
          candidate.unionLabel === undefined &&
          candidate.required === firstProp.required &&
          computeSchemaSignature(candidate.schema) === firstSig
        );
      });
      if (presentInAll && !result.has(key)) {
        result.set(key, firstProp);
      }
    }
  }

  return result;
};

/** 递归剔除分支及子分支中已提升为全局公共的字段。 */
const stripHoistedPropertiesFromUnion = (
  union: ExtractedUnionGroup,
  hoistedKeys: Set<string>
): ExtractedUnionGroup => ({
  keyword: union.keyword,
  branches: union.branches.map((branch) => {
    const cleaned = { ...branch };
    if (isPlainObject(cleaned.properties)) {
      cleaned.properties = Object.fromEntries(
        Object.entries(cleaned.properties).filter(([k]) => !hoistedKeys.has(k))
      );
    }
    for (const kw of ['allOf', 'anyOf', 'oneOf'] as const) {
      if (Array.isArray(cleaned[kw])) {
        cleaned[kw] = cleaned[kw].map((part) =>
          isPlainObject(part)
            ? stripHoistedPropertiesFromUnion(
                { keyword: 'anyOf', branches: [part] },
                hoistedKeys
              ).branches[0]
            : part
        );
      }
    }
    return cleaned;
  })
});

/** 将同一 union 组内的分支公共字段与共享子 union 提升至父层，避免重复渲染多倍字段。 */
const factorUnionBranches = (unionGroup: ExtractedUnionGroup) => {
  const invariantMaps = unionGroup.branches.map((branch) => collectInvariantProperties(branch));

  // 1. 提取所有叶子分支中结构、必填性与非互斥标牌完全一致的公共字段。
  const firstProps = invariantMaps[0] ?? new Map<string, FlattenedProperty>();
  const sharedProps = new Map<string, FlattenedProperty>();
  for (const [key, firstProp] of firstProps) {
    if (firstProp.unionLabel !== undefined) continue;
    const firstSig = computeSchemaSignature(firstProp.schema);
    const isSharedAcrossAll = invariantMaps.every((branchMap) => {
      const candidate = branchMap.get(key);
      return (
        candidate !== undefined &&
        candidate.unionLabel === undefined &&
        candidate.required === firstProp.required &&
        computeSchemaSignature(candidate.schema) === firstSig
      );
    });
    if (isSharedAcrossAll) {
      sharedProps.set(key, firstProp);
    }
  }

  const hoistedKeys = new Set(sharedProps.keys());
  const strippedGroup =
    hoistedKeys.size > 0
      ? stripHoistedPropertiesFromUnion(unionGroup, hoistedKeys)
      : unionGroup;
  const branchDecompositions = strippedGroup.branches.map((branch) => ({
    raw: branch,
    decomposed: decomposeObjectSchema(branch)
  }));

  // 2. 提取在全部分支中完全一致的嵌套子 union（例如 getHistories 各鉴权分支共享的分页 union）。
  const sharedNestedUnions: ExtractedUnionGroup[] = [];
  const sharedUnionSignatures = new Set<string>();
  const firstUnions = branchDecompositions[0]?.decomposed.unions ?? [];
  for (const candidateUnion of firstUnions) {
    const candidateSig = computeSchemaSignature(candidateUnion.branches);
    const presentInAll = branchDecompositions.every(({ decomposed }) =>
      decomposed.unions.some((u) => computeSchemaSignature(u.branches) === candidateSig)
    );
    if (presentInAll && !sharedUnionSignatures.has(candidateSig)) {
      sharedUnionSignatures.add(candidateSig);
      sharedNestedUnions.push(candidateUnion);
    }
  }

  // 3. 过滤出每个分支独有或存在差异的属性与嵌套 union。
  const prunedBranches = branchDecompositions.map(({ raw, decomposed }) => {
    const specificProps = new Map<string, FlattenedProperty>();
    for (const [key, prop] of decomposed.properties) {
      if (!sharedProps.has(key)) {
        specificProps.set(key, prop);
      }
    }
    const specificUnions = decomposed.unions.filter(
      (u) => !sharedUnionSignatures.has(computeSchemaSignature(u.branches))
    );
    return {
      raw,
      properties: specificProps,
      unions: specificUnions
    };
  });

  return {
    sharedProps,
    sharedNestedUnions,
    prunedBranches
  };
};

/** 递归渲染对象及互斥分支（控制标题层级不超过 ####，超过深度以简洁列表展示）。 */
const renderStructuredSchemaSection = (params: {
  schema: unknown;
  locale: OpenApiLocale;
  headingDepth: number;
  maxDepth?: number;
  commonHeading?: string;
  unionHeading?: string;
  visitedSignatures?: Set<string>;
}): string => {
  const {
    schema,
    locale,
    headingDepth,
    maxDepth = 3,
    commonHeading,
    unionHeading,
    visitedSignatures = new Set()
  } = params;
  const isEn = locale === 'en';
  const sig = computeSchemaSignature(schema);
  if (visitedSignatures.has(sig)) return '';
  const nextVisited = new Set(visitedSignatures).add(sig);

  const decomposed = decomposeObjectSchema(schema);
  const blocks: string[] = [];

  if (decomposed.properties.size > 0) {
    if (commonHeading !== undefined) {
      blocks.push(`${'#'.repeat(Math.min(headingDepth, 4))} ${commonHeading}`);
    }
    blocks.push(renderPropertiesTable({ properties: decomposed.properties, locale, maxDepth }));
  }

  const renderUnionGroup = (union: ExtractedUnionGroup, depth: number, groupTitle?: string) => {
    const { sharedProps, sharedNestedUnions, prunedBranches } = factorUnionBranches(union);
    if (sharedProps.size > 0) {
      blocks.push(
        `${'#'.repeat(Math.min(depth, 4))} ${groupTitle ?? (isEn ? 'Shared Parameters Across Branches' : '各分支公共字段')}`
      );
      blocks.push(renderPropertiesTable({ properties: sharedProps, locale, maxDepth }));
    }

    if (prunedBranches.length > 0) {
      const branchSectionTitle =
        unionHeading ??
        (isEn
          ? `Mutually Exclusive Branches (\`${union.keyword}\`)`
          : `互斥参数分支（\`${union.keyword}\` 选填其一）`);
      if (depth <= 3) {
        blocks.push(`${'#'.repeat(depth)} ${branchSectionTitle}`);
      } else {
        blocks.push(`**${branchSectionTitle}**`);
      }

      prunedBranches.forEach((branch, index) => {
        const rawTitle =
          typeof branch.raw.title === 'string' && branch.raw.title.trim().length > 0
            ? branch.raw.title.trim()
            : isEn
              ? `Option ${index + 1}`
              : `分支 ${index + 1}`;
        const rawDesc =
          typeof branch.raw.description === 'string' && branch.raw.description.trim().length > 0
            ? sanitizeMdxProse(branch.raw.description.trim())
            : '';

        if (depth + 1 <= 4) {
          blocks.push(`${'#'.repeat(depth + 1)} ${sanitizeMdxProse(rawTitle)}`);
        } else {
          blocks.push(`- **${sanitizeMdxProse(rawTitle)}**`);
        }

        if (rawDesc.length > 0) {
          blocks.push(rawDesc);
        }

        if (branch.properties.size > 0) {
          blocks.push(renderPropertiesTable({ properties: branch.properties, locale, maxDepth }));
        } else if (branch.unions.length === 0) {
          blocks.push(
            isEn
              ? 'No extra branch-specific fields are required.'
              : '该分支无需额外字段。'
          );
        }

        for (const subUnion of branch.unions) {
          const subSig = computeSchemaSignature(subUnion.branches);
          if (nextVisited.has(subSig)) continue;
          const {
            sharedProps: subShared,
            sharedNestedUnions: subSharedUnions,
            prunedBranches: subBranches
          } = factorUnionBranches(subUnion);

          if (subShared.size > 0) {
            blocks.push(
              `**${isEn ? 'Shared Fields in This Branch' : '该分支公共字段'}**`
            );
            blocks.push(renderPropertiesTable({ properties: subShared, locale, maxDepth }));
          }

          subBranches.forEach((subBranch, subIndex) => {
            const subTitle =
              typeof subBranch.raw.title === 'string' && subBranch.raw.title.trim().length > 0
                ? subBranch.raw.title.trim()
                : isEn
                  ? `Sub-option ${subIndex + 1}`
                  : `子分支 ${subIndex + 1}`;
            const subDesc =
              typeof subBranch.raw.description === 'string' &&
              subBranch.raw.description.trim().length > 0
                ? sanitizeMdxProse(subBranch.raw.description.trim())
                : '';
            blocks.push(`**${sanitizeMdxProse(subTitle)}**${subDesc.length > 0 ? `: ${subDesc}` : ''}`);
            if (subBranch.properties.size > 0) {
              blocks.push(
                renderPropertiesTable({ properties: subBranch.properties, locale, maxDepth })
              );
            }
            for (const nestedSub of subBranch.unions) {
              const nestedText = renderStructuredSchemaSection({
                schema: { [nestedSub.keyword]: nestedSub.branches },
                locale,
                headingDepth: 4,
                maxDepth: 2,
                visitedSignatures: nextVisited
              });
              if (nestedText.length > 0) blocks.push(nestedText);
            }
          });

          for (const extraSharedUnion of subSharedUnions) {
            renderUnionGroup(extraSharedUnion, Math.min(depth + 1, 4));
          }
        }
      });
    }

    for (const sharedUnion of sharedNestedUnions) {
      renderUnionGroup(
        sharedUnion,
        Math.min(depth, 3),
        isEn ? 'Additional Shared Options' : '附加公共参数分支'
      );
    }
  };

  for (const union of decomposed.unions) {
    renderUnionGroup(union, headingDepth);
  }

  return blocks.filter((b) => b.trim().length > 0).join('\n\n');
};

/** 收集数组多态子项（如 `messages[]` 或 `responseData[]`）并生成简明分支说明表。 */
const renderArrayUnionFieldNotes = (params: {
  schema: unknown;
  locale: OpenApiLocale;
}): string => {
  const { schema, locale } = params;
  const isEn = locale === 'en';
  const decomposed = decomposeObjectSchema(schema);
  const seenFields = new Set<string>();
  const notes: string[] = [];

  const inspectProps = (props: Map<string, FlattenedProperty>) => {
    for (const prop of props.values()) {
      if (seenFields.has(prop.name)) continue;
      const itemSchema = prop.schema.type === 'array' ? prop.schema.items : prop.schema;
      if (!isPlainObject(itemSchema)) continue;
      const itemUnions = Array.isArray(itemSchema.anyOf)
        ? itemSchema.anyOf
        : Array.isArray(itemSchema.oneOf)
          ? itemSchema.oneOf
          : undefined;
      if (itemUnions === undefined || itemUnions.length === 0 || !isObjectSchemaNode(itemSchema)) {
        continue;
      }
      seenFields.add(prop.name);
      const itemCount = itemUnions.length;
      const branchSummaries = itemUnions.slice(0, 12).map((branch, idx) => {
        if (!isPlainObject(branch)) return `- Variant ${idx + 1}`;
        const branchDesc = decomposeObjectSchema(branch);
        const keys = [...branchDesc.properties.keys()]
          .slice(0, 8)
          .map((k) => `\`${k}\``)
          .join(', ');
        const constPairs = [...branchDesc.properties.values()]
          .filter((p) => p.schema.const !== undefined)
          .map((p) => `\`${p.name}=${JSON.stringify(p.schema.const)}\``);
        const discriminatorSuffix = constPairs.length > 0 ? ` (${constPairs.join(', ')})` : '';
        const title =
          typeof branch.title === 'string' && branch.title.trim().length > 0
            ? sanitizeMdxProse(branch.title.trim())
            : isEn
              ? `Variant ${idx + 1}`
              : `变体 ${idx + 1}`;
        return `- **${title}**${discriminatorSuffix}: ${keys.length > 0 ? keys : isEn ? 'Object fields' : '对象字段'}`;
      });
      const overflowNote =
        itemCount > 12
          ? isEn
            ? `\n- ...and ${itemCount - 12} more variant types in the OpenAPI schema.`
            : `\n- 其余 ${itemCount - 12} 种节点变体请参见 OpenAPI 契约。`
          : '';
      notes.push(
        `#### ${isEn ? `Polymorphic Field: \`${prop.name}\`` : `多态字段明细：\`${prop.name}\``}\n\n${branchSummaries.join('\n')}${overflowNote}`
      );
    }
  };

  inspectProps(decomposed.properties);
  for (const union of decomposed.unions) {
    for (const branch of union.branches) {
      inspectProps(decomposeObjectSchema(branch).properties);
    }
  }

  return notes.join('\n\n');
};

/** 构造请求 Query 参数字符串与 cURL 示例（含 `query` 复合对象展平与 multipart/form-data）。 */
const buildCurlAndRequestExamples = (params: {
  method: string;
  apiPath: string;
  operation: SchemaObject;
  locale: OpenApiLocale;
}): { curlBlock: string; jsonExampleBlock?: string } => {
  const { method, apiPath, operation, locale } = params;
  const isEn = locale === 'en';
  const origin = locale === 'en' ? 'https://cloud.fastgpt.io' : 'https://cloud.fastgpt.cn';
  const isPublicNoAuth = apiPath === '/core/ai/model/list';
  const upperMethod = method.toUpperCase();

  // 1. 提取 Path 与 Query 参数示例（自动展平 `name === 'query'` 的 form/explode 对象）。
  let resolvedPath = `/api${apiPath}`;
  const queryPairs: Array<[string, string]> = [];
  const rawParams = Array.isArray(operation.parameters) ? operation.parameters : [];

  for (const rawParam of rawParams) {
    if (!isPlainObject(rawParam)) continue;
    const paramIn = String(rawParam.in ?? '');
    const paramName = String(rawParam.name ?? '');
    const defaultEx = isPlainObject(rawParam.examples) && isPlainObject(rawParam.examples.default)
      ? rawParam.examples.default
      : undefined;
    const exValue = defaultEx?.value ?? rawParam.example;
    const isDisabled = defaultEx?.['x-disabled'] === true;

    if (paramIn === 'path' && exValue !== undefined) {
      resolvedPath = resolvedPath.replace(`{${paramName}}`, encodeURIComponent(String(exValue)));
      continue;
    }

    if (paramIn === 'query') {
      if (paramName === 'query' && rawParam.explode === true && isPlainObject(exValue)) {
        for (const [k, v] of Object.entries(exValue)) {
          if (v !== undefined && v !== null) {
            queryPairs.push([k, typeof v === 'string' ? v : JSON.stringify(v)]);
          }
        }
      } else if (!isDisabled && exValue !== undefined && exValue !== null) {
        queryPairs.push([
          paramName,
          typeof exValue === 'string' ? exValue : JSON.stringify(exValue)
        ]);
      }
    }
  }

  const queryString =
    queryPairs.length > 0
      ? `?${queryPairs.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')}`
      : '';
  const url = `${origin}${resolvedPath}${queryString}`;

  const content = isPlainObject(operation.requestBody) && isPlainObject(operation.requestBody.content)
    ? operation.requestBody.content
    : undefined;
  const jsonMedia = content && isPlainObject(content['application/json']) ? content['application/json'] : undefined;
  const formMedia =
    content && isPlainObject(content['multipart/form-data'])
      ? content['multipart/form-data']
      : undefined;

  const lines: string[] = [`curl --fail-with-body -X ${upperMethod} "${url}" \\`];
  if (!isPublicNoAuth) {
    lines.push(
      formMedia !== undefined || jsonMedia !== undefined
        ? `  -H "Authorization: Bearer YOUR_API_KEY" \\`
        : `  -H "Authorization: Bearer YOUR_API_KEY"`
    );
  } else if (formMedia === undefined && jsonMedia === undefined) {
    lines[0] = `curl --fail-with-body -X ${upperMethod} "${url}"`;
  }

  let jsonExampleBlock: string | undefined;

  if (jsonMedia !== undefined && jsonMedia.example !== undefined) {
    const prettyJson = JSON.stringify(jsonMedia.example, null, 2);
    lines.push(`  -H "Content-Type: application/json" \\`);
    lines.push(`  --data-raw '${prettyJson.replace(/'/g, `'\\''`)}'`);
    jsonExampleBlock = `\`\`\`json\n${prettyJson}\n\`\`\``;
  } else if (formMedia !== undefined && isPlainObject(formMedia.example)) {
    const dataPayload = formMedia.example.data ?? {};
    const compactData = JSON.stringify(dataPayload);
    lines.push(`  -F "file=@/path/to/document.pdf" \\`);
    lines.push(`  -F 'data=${compactData.replace(/'/g, `'\\''`)};type=application/json'`);
    jsonExampleBlock = `\`\`\`json\n${JSON.stringify(dataPayload, null, 2)}\n\`\`\``;
  } else if (lines.length > 1 && lines.at(-1)?.endsWith(' \\')) {
    lines[lines.length - 1] = lines.at(-1)!.slice(0, -2);
  }

  const curlBlock = `\`\`\`bash\n${lines.join('\n')}\n\`\`\``;
  if (isEn) {
    return { curlBlock, jsonExampleBlock };
  }
  return { curlBlock, jsonExampleBlock };
};

/** 静态渲染 `/v1/chat/completions` 与 `/v2/chat/completions` 的完整 JSON 与 SSE event 示例。 */
const renderChatCompletionExamplesSection = (params: {
  version: 'v1' | 'v2';
  locale: OpenApiLocale;
  examplesBundle: CompletionResponseExamplesBundle;
}): string => {
  const { version, locale, examplesBundle } = params;
  const isEn = locale === 'en';
  const parts: string[] = [];

  parts.push(
    isEn
      ? `### Non-Streaming JSON Response Examples (${version})`
      : `### 非流式 JSON 响应示例（${version}）`
  );
  for (const example of Object.values(examplesBundle.json)) {
    parts.push(`#### ${sanitizeMdxProse(example.summary)}`);
    parts.push(sanitizeMdxProse(example.description));
    parts.push(`\`\`\`json\n${JSON.stringify(example.value, null, 2)}\n\`\`\``);
  }

  parts.push(
    isEn
      ? `### Streaming SSE Flow Examples (${version})`
      : `### 流式 SSE 完整过程示例（${version}）`
  );
  for (const example of Object.values(examplesBundle.sse)) {
    parts.push(`#### ${sanitizeMdxProse(example.summary)}`);
    parts.push(sanitizeMdxProse(example.description));
    parts.push(`\`\`\`text\n${String(example.value).trimEnd()}\n\`\`\``);
  }

  parts.push(
    isEn
      ? `### SSE \`event\` Types Reference (${version})`
      : `### SSE \`event\` 事件类型详细示例（${version}）`
  );
  for (const event of examplesBundle.events) {
    parts.push(`#### \`${event.name}\` · ${sanitizeMdxProse(event.label)}`);
    parts.push(sanitizeMdxProse(event.description));
    parts.push(`\`\`\`text\n${event.value.trimEnd()}\n\`\`\``);
  }

  return parts.join('\n\n');
};

/** 推断操作所属鉴权作用域说明。 */
const resolveAuthScopeSummary = (params: {
  apiPath: string;
  operation: SchemaObject;
  locale: OpenApiLocale;
}): string => {
  const { apiPath, operation, locale } = params;
  const isEn = locale === 'en';

  if (apiPath === '/core/ai/model/list') {
    return isEn
      ? 'No authentication required (public endpoint)'
      : '无需鉴权（公开接口）';
  }

  const serialized = JSON.stringify(operation);
  const supportsAppKey =
    serialized.includes('应用 API Key') ||
    serialized.includes('APP API Key') ||
    serialized.includes('App API Key');
  const supportsOutLink = serialized.includes('outLinkAuthData');
  const supportsProxy = serialized.includes('authProxy');

  if (supportsAppKey) {
    const extras: string[] = [];
    if (supportsProxy) {
      extras.push(isEn ? '`authProxy` team member proxy' : '`authProxy` 团队成员代理');
    }
    if (supportsOutLink) {
      extras.push(isEn ? '`outLinkAuthData` share link' : '`outLinkAuthData` 外链分享');
    }
    const extraSuffix =
      extras.length > 0
        ? isEn
          ? `; also supports ${extras.join(' and ')}`
          : `；另支持 ${extras.join('与')}`
        : '';
    return isEn
      ? `\`Authorization: Bearer <apiKey>\` — Supports **App API Key** (\`appId\` optional) and **Personal API Key** (\`appId\` required)${extraSuffix}`
      : `\`Authorization: Bearer <apiKey>\` — 支持 **应用 API Key**（无需 \`appId\`）与 **个人密钥**（需传 \`appId\`）${extraSuffix}`;
  }

  return isEn
    ? '`Authorization: Bearer <apiKey>` — Personal API Key (access scoped by team member permissions)'
    : '`Authorization: Bearer <apiKey>` — 个人密钥（按归属团队成员资源权限校验）';
};

/** 构造废弃接口顶部迁移提示 `<Alert>`。 */
const renderDeprecationBanner = (params: {
  opKey: string;
  locale: OpenApiLocale;
}): string => {
  const { opKey, locale } = params;
  const isEn = locale === 'en';
  const langPrefix = isEn ? '/en' : '/zh-CN';

  if (opKey === 'POST /v1/chat/completions') {
    return isEn
      ? `<Alert icon="⚠️" context="warning">\n  **Deprecated Endpoint**: \`POST /api/v1/chat/completions\` is deprecated. Migrate to [Create Chat Completion (v2)](${langPrefix}/openapi/reference/chat-controller/v2-chat-completions) (\`POST /api/v2/chat/completions\`), which delivers per-node \`flowNodeResponse\` SSE events and full \`authProxy\` support.\n</Alert>`
      : `<Alert icon="⚠️" context="warning">\n  **接口已弃用**：\`POST /api/v1/chat/completions\` 为旧版兼容接口。新接入请迁移至 [发起会话 v2](${langPrefix}/openapi/reference/chat-controller/v2-chat-completions)（\`POST /api/v2/chat/completions\`），支持逐节点 \`flowNodeResponse\` SSE 事件流与完整的 \`authProxy\` 代理能力。\n</Alert>`;
  }

  if (opKey === 'POST /core/dataset/list') {
    return isEn
      ? `<Alert icon="⚠️" context="warning">\n  **Deprecated Endpoint**: \`POST /api/core/dataset/list\` is deprecated. Migrate to [List Datasets (V2)](${langPrefix}/openapi/reference/dataset/list-v2) (\`POST /api/core/dataset/listV2\`) for paginated queries and \`datasetIds\` batch lookup.\n</Alert>`
      : `<Alert icon="⚠️" context="warning">\n  **接口已弃用**：\`POST /api/core/dataset/list\` 为旧版无分页接口。新接入请迁移至 [获取知识库列表 V2](${langPrefix}/openapi/reference/dataset/list-v2)（\`POST /api/core/dataset/listV2\`），支持分页查询与 \`datasetIds\` 批量检索。\n</Alert>`;
  }

  return isEn
    ? `<Alert icon="⚠️" context="warning">\n  **Deprecated Endpoint**: \`POST /api/core/dataset/collection/create/apiCollection\` (V1) is deprecated. For active System OpenAPI collection creation, use [Create Collection from Local File](${langPrefix}/openapi/reference/dataset-collection-create/local-file), [Create Collection from Link](${langPrefix}/openapi/reference/dataset-collection-create/link), or [Create Collection from Text](${langPrefix}/openapi/reference/dataset-collection-create/text), or check V2 batch import (\`apiCollectionV2\`) in your instance Dev API.\n</Alert>`
    : `<Alert icon="⚠️" context="warning">\n  **接口已弃用**：\`POST /api/core/dataset/collection/create/apiCollection\`（V1）已进入历史兼容阶段。System OpenAPI 新接入请使用 [上传本地文件创建集合](${langPrefix}/openapi/reference/dataset-collection-create/local-file)、[通过链接创建集合](${langPrefix}/openapi/reference/dataset-collection-create/link) 或 [通过文本创建集合](${langPrefix}/openapi/reference/dataset-collection-create/text)，如需 V2 批量导入（\`apiCollectionV2\`）请查看实例 Dev API。\n</Alert>`;
};

/** 渲染单个端点的完整单页 MDX 文档（6 段结构）。 */
const renderOperationMdx = (params: {
  opKey: string;
  method: string;
  apiPath: string;
  module: string;
  zhTag: string;
  operation: SchemaObject;
  opMeta: TranslationOperationLocale;
  moduleMeta: TranslationModuleEntry;
  locale: OpenApiLocale;
  completionExamples?: CompletionResponseExamplesBundle;
}): string => {
  const {
    opKey,
    method,
    apiPath,
    zhTag,
    operation,
    opMeta,
    moduleMeta,
    locale,
    completionExamples
  } = params;
  const isEn = locale === 'en';
  const upperMethod = method.toUpperCase();
  const fullEndpointPath = `/api${apiPath}`;
  const isDeprecated = operation.deprecated === true;
  const langPrefix = isEn ? '/en' : '/zh-CN';

  // 1. 构造 Frontmatter。
  const frontmatterLines = [
    '---',
    `title: ${JSON.stringify(opMeta.title)}`,
    `seoTitle: ${JSON.stringify(opMeta.seoTitle)}`,
    `description: ${JSON.stringify(opMeta.description)}`,
    ...(isDeprecated ? ['deprecated: true'] : []),
    '---'
  ];

  const sections: string[] = [frontmatterLines.join('\n')];

  // 2. 废弃接口顶部迁移提示。
  if (isDeprecated) {
    sections.push(`import { Alert } from '@/components/docs/Alert';`);
    sections.push(renderDeprecationBanner({ opKey, locale }));
  }

  // 3. 端点概览（含 Scalar 在线调试锚点）。
  const scalarOrigin = isEn ? 'https://cloud.fastgpt.io' : 'https://cloud.fastgpt.cn';
  const scalarAnchor = `tag/${encodeURIComponent(zhTag)}/${upperMethod}${apiPath}`;
  const scalarUrl = `${scalarOrigin}/apidoc/systemopenapi#${scalarAnchor}`;
  const groupName = isEn ? moduleMeta.enGroup : moduleMeta.zhGroup;
  const moduleName = isEn ? moduleMeta.enTitle : moduleMeta.zhTitle;
  const authSummary = resolveAuthScopeSummary({ apiPath, operation, locale });

  const overviewLines = isEn
    ? [
        '## Endpoint Overview',
        '',
        `- **Method**: \`${upperMethod}\``,
        `- **Path**: \`${fullEndpointPath}\``,
        `- **Module**: ${groupName} / ${moduleName}`,
        `- **Authentication**: ${authSummary} (see [API Getting Started](${langPrefix}/openapi/intro))`,
        `- **Interactive Try-It-Out**: [Open in Scalar API Explorer](${scalarUrl}) (self-hosted instances: replace the origin with \`<instance>/apidoc/systemopenapi#${scalarAnchor}\`)`
      ]
    : [
        '## 端点概览',
        '',
        `- **HTTP 方法**：\`${upperMethod}\``,
        `- **请求路径**：\`${fullEndpointPath}\``,
        `- **所属模块**：${groupName} / ${moduleName}`,
        `- **鉴权方式**：${authSummary}（详见 [API 入门：完成首次请求](${langPrefix}/openapi/intro)）`,
        `- **在线调试**：[在云服务 Scalar 调试台打开](${scalarUrl})（自部署实例请将域名替换为 \`<instance>/apidoc/systemopenapi#${scalarAnchor}\`）`
      ];
  sections.push(overviewLines.join('\n'));

  // 4. 接口说明与注意事项。
  const rawDescription =
    typeof operation.description === 'string' && operation.description.trim().length > 0
      ? operation.description.trim()
      : typeof operation.summary === 'string'
        ? operation.summary.trim()
        : '';
  sections.push(
    `${isEn ? '## Description & Notes' : '## 接口说明与注意事项'}\n\n${sanitizeMdxProse(rawDescription)}`
  );

  // 5. 请求参数（Path / Query / Header / Body + 互斥分支）。
  const paramSections: string[] = [isEn ? '## Request Parameters' : '## 请求参数'];

  if (Array.isArray(operation['x-required-parameter-alternatives'])) {
    const alts = operation['x-required-parameter-alternatives'] as Array<
      Array<{ in: string; name: string }>
    >;
    const altText = alts
      .map((group) => group.map((field) => `\`${field.in}.${field.name}\``).join(' + '))
      .join(isEn ? ' OR ' : ' 或 ');
    paramSections.push(
      isEn
        ? `> **Parameter Alternatives**: Provide one of the following locator sets: ${altText}.`
        : `> **参数定位组合（多选一）**：请提供以下任意一组定位参数：${altText}。`
    );
  }

  const rawParameters = Array.isArray(operation.parameters) ? operation.parameters : [];
  const pathParams: FlattenedProperty[] = [];
  const scalarQueryParams: FlattenedProperty[] = [];
  const queryUnionSchemas: SchemaObject[] = [];
  const headerParams: FlattenedProperty[] = [];

  for (const param of rawParameters) {
    if (!isPlainObject(param)) continue;
    const paramIn = String(param.in ?? '');
    const paramName = String(param.name ?? '');
    const rawSchema = isPlainObject(param.schema) ? param.schema : {};
    const mergedSchema: SchemaObject = {
      ...rawSchema,
      ...(typeof param.description === 'string' && rawSchema.description === undefined
        ? { description: param.description }
        : {})
    };

    if (
      paramIn === 'query' &&
      paramName === 'query' &&
      param.explode === true &&
      isObjectSchemaNode(mergedSchema)
    ) {
      queryUnionSchemas.push(mergedSchema);
      continue;
    }

    const entry: FlattenedProperty = {
      name: paramName,
      schema: mergedSchema,
      required: param.required === true
    };
    if (paramIn === 'path') pathParams.push(entry);
    else if (paramIn === 'query') scalarQueryParams.push(entry);
    else if (paramIn === 'header') headerParams.push(entry);
  }

  if (pathParams.length > 0) {
    paramSections.push(`### ${isEn ? 'Path Parameters' : 'Path 路径参数'}`);
    paramSections.push(
      renderPropertiesTable({
        properties: new Map(pathParams.map((p) => [p.name, p])),
        locale
      })
    );
  }

  if (scalarQueryParams.length > 0 || queryUnionSchemas.length > 0) {
    paramSections.push(`### ${isEn ? 'Query Parameters' : 'Query 查询参数'}`);
    if (scalarQueryParams.length > 0) {
      paramSections.push(
        renderPropertiesTable({
          properties: new Map(scalarQueryParams.map((p) => [p.name, p])),
          locale
        })
      );
    }
    for (const qSchema of queryUnionSchemas) {
      const rendered = renderStructuredSchemaSection({
        schema: qSchema,
        locale,
        headingDepth: 4
      });
      if (rendered.length > 0) paramSections.push(rendered);
    }
  }

  if (headerParams.length > 0) {
    paramSections.push(`### ${isEn ? 'Header Parameters' : 'Header 请求头参数'}`);
    paramSections.push(
      renderPropertiesTable({
        properties: new Map(headerParams.map((p) => [p.name, p])),
        locale
      })
    );
  }

  const reqBody = isPlainObject(operation.requestBody) ? operation.requestBody : undefined;
  const reqContent =
    reqBody !== undefined && isPlainObject(reqBody.content) ? reqBody.content : undefined;
  if (reqContent !== undefined) {
    const mediaType = isPlainObject(reqContent['application/json'])
      ? 'application/json'
      : Object.keys(reqContent)[0];
    const mediaObj =
      mediaType !== undefined && isPlainObject(reqContent[mediaType])
        ? reqContent[mediaType]
        : undefined;

    if (mediaObj !== undefined && mediaObj.schema !== undefined) {
      paramSections.push(
        `### ${isEn ? `Request Body (\`${mediaType}\`)` : `Request Body 请求体（\`${mediaType}\`）`}`
      );
      const renderedBody = renderStructuredSchemaSection({
        schema: mediaObj.schema,
        locale,
        headingDepth: 4
      });
      if (renderedBody.length > 0) {
        paramSections.push(renderedBody);
      }
      const polymorphicNotes = renderArrayUnionFieldNotes({
        schema: mediaObj.schema,
        locale
      });
      if (polymorphicNotes.length > 0) {
        paramSections.push(polymorphicNotes);
      }
    }
  }

  if (paramSections.length === 1) {
    paramSections.push(
      isEn
        ? 'This endpoint does not require request parameters or a request body.'
        : '该接口无需额外请求参数或请求体。'
    );
  }
  sections.push(paramSections.join('\n\n'));

  // 6. 请求示例（cURL + setRequiredRequestExamples JSON）。
  const { curlBlock, jsonExampleBlock } = buildCurlAndRequestExamples({
    method,
    apiPath,
    operation,
    locale
  });
  const exampleSection: string[] = [
    isEn ? '## Request Examples' : '## 请求示例',
    isEn
      ? 'Replace `YOUR_API_KEY` and placeholder IDs before running. Self-hosted users should replace the base URL with `<instance>/api`.'
      : '调用前请将 `YOUR_API_KEY` 与示例 ID 替换为真实值；私有化部署实例请将基础域名替换为 `<instance>/api`。',
    `### ${isEn ? 'cURL Example' : 'cURL 请求示例'}`,
    curlBlock
  ];
  if (jsonExampleBlock !== undefined) {
    exampleSection.push(
      `### ${isEn ? 'Minimal Valid JSON Body' : '最小合法 JSON 请求体示例'}`,
      jsonExampleBlock
    );
  }
  sections.push(exampleSection.join('\n\n'));

  // 7. 响应结构与示例（含 /v1 & /v2/chat/completions 全量 JSON 与 SSE event 静态展开）。
  const responseSections: string[] = [isEn ? '## Response Schema & Examples' : '## 响应结构与示例'];
  const isCompletions =
    opKey === 'POST /v1/chat/completions' || opKey === 'POST /v2/chat/completions';

  if (!isCompletions && apiPath !== '/core/dataset/collection/batchDownload') {
    responseSections.push(
      isEn
        ? 'Successful `/api/*` calls return the standard FastGPT envelope `{ "code": 200, "statusText": "", "message": "", "data": ... }`, where `data` matches the `200` schema below (and `null` when no payload schema is declared).'
        : '除兼容 OpenAI 协议的对话补全或二进制下载接口外，成功响应统一包裹在 `{ "code": 200, "statusText": "", "message": "", "data": ... }` 标准结构中；下方 `200` 字段表对应 `data` 载荷结构（无数据返回时 `data` 为 `null`）。'
    );
  }

  const responses = isPlainObject(operation.responses) ? operation.responses : {};
  for (const [statusCode, rawResp] of Object.entries(responses)) {
    if (!isPlainObject(rawResp)) continue;
    const respDesc =
      typeof rawResp.description === 'string' && rawResp.description.trim().length > 0
        ? sanitizeMdxProse(rawResp.description.trim())
        : '';
    responseSections.push(`### HTTP ${statusCode}`);
    if (respDesc.length > 0) {
      responseSections.push(respDesc);
    }

    const respContent = isPlainObject(rawResp.content) ? rawResp.content : undefined;
    if (respContent === undefined || Object.keys(respContent).length === 0) {
      responseSections.push(
        isEn ? 'Returns standard success envelope with `data: null`.' : '返回标准成功响应（`data: null`）。'
      );
      continue;
    }

    for (const [mediaType, mediaObj] of Object.entries(respContent)) {
      if (!isPlainObject(mediaObj)) continue;
      responseSections.push(`**Content-Type**: \`${mediaType}\``);

      if (mediaObj.schema !== undefined) {
        const schemaObj = unwrapPropertySchema(mediaObj.schema).schema;
        if (schemaObj.format === 'binary') {
          responseSections.push(
            isEn
              ? 'Returns raw binary stream (`application/zip`). Save with `curl -o archive.zip`.'
              : '返回原始二进制文件流（`application/zip`），可通过 `curl -o archive.zip` 保存。'
          );
        } else {
          const renderedResp = renderStructuredSchemaSection({
            schema: mediaObj.schema,
            locale,
            headingDepth: 4,
            maxDepth: isCompletions ? 2 : 3
          });
          if (renderedResp.length > 0) responseSections.push(renderedResp);

          if (!isCompletions) {
            const polyNotes = renderArrayUnionFieldNotes({ schema: mediaObj.schema, locale });
            if (polyNotes.length > 0) responseSections.push(polyNotes);
          }
        }
      }

      if (!isCompletions && mediaObj.example !== undefined) {
        responseSections.push(
          `#### ${isEn ? 'Response Example' : '响应示例'}\n\n\`\`\`json\n${JSON.stringify(mediaObj.example, null, 2)}\n\`\`\``
        );
      }
    }
  }

  if (isCompletions && completionExamples !== undefined) {
    const version = opKey === 'POST /v1/chat/completions' ? 'v1' : 'v2';
    responseSections.push(
      renderChatCompletionExamplesSection({
        version,
        locale,
        examplesBundle: completionExamples
      })
    );
  }

  sections.push(responseSections.join('\n\n'));

  return `${sections.join('\n\n')}\n`;
};

/** 合并并生成规范化 `content/openapi/meta*.json`（确保包含 `reference` 节点）。 */
const buildUpdatedOpenApiMeta = (filePath: string): string => {
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as {
    root?: boolean;
    title: string;
    pages: string[];
  };
  const pages = [...parsed.pages];
  if (!pages.includes('reference')) {
    const apiRefIndex = pages.indexOf('api-reference');
    if (apiRefIndex !== -1) {
      pages.splice(apiRefIndex + 1, 0, 'reference');
    } else {
      pages.unshift('reference');
    }
  }
  return `${JSON.stringify({ ...parsed, pages }, null, 2)}\n`;
};

/** 使用文档工作区 `textlint --fix` + `prettier` 对生成 MDX 做内存级确定性格式化与门禁校验。 */
const createMdxFormatter = async () => {
  const { createLinter, loadTextlintrc } = documentRequire('textlint') as typeof import('textlint');
  const prettier = rootRequire('prettier') as typeof import('prettier');
  const descriptor = await loadTextlintrc({
    configFilePath: path.join(DOCUMENT_ROOT, '.textlintrc.json')
  });
  const linter = createLinter({ descriptor });
  const prettierConfig = await prettier.resolveConfig(path.join(REPO_ROOT, '.prettierrc.js'));
  const { remark } = documentRequire('remark') as typeof import('remark');
  const remarkMdx = (documentRequire('remark-mdx') as { default: unknown }).default as never;
  const remarkGfm = (documentRequire('remark-gfm') as { default: unknown }).default as never;
  const mdxParser = remark().use(remarkMdx).use(remarkGfm);

  return async (params: { raw: string; targetFilePath: string }): Promise<string> => {
    const { raw, targetFilePath } = params;
    let current = raw;
    // 先修复中文技术写作空白/标点，再经 Prettier 统一排版，必要时二轮收敛至完全幂等。
    for (let pass = 0; pass < 2; pass++) {
      const fixed = await linter.fixText(current, targetFilePath);
      const formatted = await prettier.format(fixed.output, {
        ...(prettierConfig ?? {}),
        filepath: targetFilePath
      });
      if (formatted === current) break;
      current = formatted;
    }

    const lintResult = await linter.lintText(current, targetFilePath);
    const errors = lintResult.messages.filter((m) => m.severity === 2);
    if (errors.length > 0) {
      const summary = errors.map((e) => `L${e.line}:${e.column} ${e.message}`).join('; ');
      throw new Error(`textlint validation failed for ${targetFilePath}: ${summary}`);
    }

    // 校验 MDX AST 可解析，且正文中绝对不含 `# ` 一级标题。
    mdxParser.parse(current);
    const bodyMatch = current.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
    const body = bodyMatch !== null ? bodyMatch[1] : current;
    const bodyWithoutFences = body.replace(/```[\s\S]*?```/g, '');
    if (/^#\s+/m.test(bodyWithoutFences)) {
      throw new Error(`In-body H1 heading detected in generated MDX: ${targetFilePath}`);
    }

    return current;
  };
};

/**
 * 在内存中生成全套 OpenAPI 参考文档与双语 JSON 契约，并执行翻译完备性、零汉字、唯一性与 MDX 语法门禁。
 */
export async function generateOpenApiDocs(): Promise<GeneratedOpenApiDocsBundle> {
  // 1. 加载 System OpenAPI 契约、union 投影工具及对话响应示例（由 registerHooks 动态映射 @fastgpt/global/*）。
  ensureFastgptGlobalLoader();
  const loadGlobalModule = <T,>(specifier: string): Promise<T> => import(specifier) as Promise<T>;
  const { apiDocOpenAPIDocument, tagGroups } = await loadGlobalModule<{
    apiDocOpenAPIDocument: SchemaObject;
    tagGroups: Array<{ name: string; tags: string[] }>;
  }>('@fastgpt/global/openapi/provider/systemopenapi');
  const { prepareOpenApiUnionPresentation } = await loadGlobalModule<{
    prepareOpenApiUnionPresentation: (doc: SchemaObject) => SchemaObject;
  }>('@fastgpt/global/openapi/unionPresentation');
  const { getChatCompletionResponseExamples } = await loadGlobalModule<{
    getChatCompletionResponseExamples: (version: 'v1' | 'v2') => CompletionResponseExamplesBundle;
  }>('@fastgpt/global/openapi/core/chat/completion/examples');

  const preparedZhDoc = prepareOpenApiUnionPresentation(apiDocOpenAPIDocument);
  stabilizeNonDeterministicDefaults(preparedZhDoc);
  preparedZhDoc.servers = [
    { url: 'https://cloud.fastgpt.cn/api', description: 'FastGPT 中国大陆云服务' },
    { url: '/api', description: '私有化部署实例相对路径' }
  ];

  // 2. 读取非侵入式英文翻译映射表，并校验分组/模块/操作完整覆盖。
  const dictionary = JSON.parse(fs.readFileSync(TRANSLATIONS_PATH, 'utf8')) as TranslationDictionary;

  for (const group of tagGroups) {
    if (typeof dictionary.tagGroups[group.name] !== 'string') {
      throw new Error(`Missing English tagGroup translation in en-translations.json: ${group.name}`);
    }
  }

  const tagToModule = new Map<string, { module: string; meta: TranslationModuleEntry }>();
  for (const moduleName of MODULE_ORDER) {
    const meta = dictionary.modules[moduleName];
    if (meta === undefined) {
      throw new Error(`Missing module metadata in en-translations.json: ${moduleName}`);
    }
    tagToModule.set(meta.zhTag, { module: moduleName, meta });
  }

  // 3. 翻译 OpenAPI 文档与 v1/v2 completion 示例，同时收集缺失词条统一报错。
  const missingTranslations: MissingTranslationItem[] = [];
  const preparedEnDoc = translateDocumentToEnglish({
    document: preparedZhDoc,
    dictionary,
    missing: missingTranslations
  });

  const completionExamplesZh = {
    v1: getChatCompletionResponseExamples('v1'),
    v2: getChatCompletionResponseExamples('v2')
  };
  const completionExamplesEn = {
    v1: translateNodeToEnglish({
      value: completionExamplesZh.v1,
      nodePath: 'examples.v1',
      opKey: 'POST /v1/chat/completions',
      dictionary,
      missing: missingTranslations
    }) as CompletionResponseExamplesBundle,
    v2: translateNodeToEnglish({
      value: completionExamplesZh.v2,
      nodePath: 'examples.v2',
      opKey: 'POST /v2/chat/completions',
      dictionary,
      missing: missingTranslations
    }) as CompletionResponseExamplesBundle
  };

  if (missingTranslations.length > 0) {
    const uniqueMissing = new Map<string, MissingTranslationItem>();
    for (const item of missingTranslations) {
      if (!uniqueMissing.has(item.hash)) uniqueMissing.set(item.hash, item);
    }
    const details = [...uniqueMissing.values()]
      .slice(0, 20)
      .map(
        (item) =>
          `- [${item.hash}] (${item.opKey ?? 'global'} @ ${item.path}): ${JSON.stringify(item.zh)}`
      )
      .join('\n');
    throw new Error(
      `Missing ${uniqueMissing.size} English translation hash(es) in ${TRANSLATIONS_PATH}:\n${details}`
    );
  }

  const zhSpecJson = `${JSON.stringify(preparedZhDoc, null, 2)}\n`;
  const enSpecJson = `${JSON.stringify(preparedEnDoc, null, 2)}\n`;
  if (HAN_REGEX.test(enSpecJson)) {
    throw new Error('English OpenAPI JSON still contains Han characters.');
  }

  // 4. 收集全部操作、推导并校验确定性 Slug 与元数据全局唯一性。
  const existingMeta = collectExistingPageMetadata();
  const seenSlugsByModule = new Map<string, Set<string>>();
  const modulePageSlugs = new Map<string, string[]>(MODULE_ORDER.map((m) => [m, []]));
  const formatMdx = await createMdxFormatter();
  const pages: GeneratedOperationPage[] = [];
  const lockedSlugs: string[] = [];

  const zhPaths = isPlainObject(preparedZhDoc.paths) ? preparedZhDoc.paths : {};
  const enPaths = isPlainObject(preparedEnDoc.paths) ? preparedEnDoc.paths : {};

  for (const [apiPath, zhPathItem] of Object.entries(zhPaths)) {
    if (!isPlainObject(zhPathItem)) continue;
    const enPathItem = isPlainObject(enPaths[apiPath]) ? enPaths[apiPath] : {};

    for (const method of HTTP_METHODS) {
      const zhOperation = zhPathItem[method];
      const enOperation = enPathItem[method];
      if (!isPlainObject(zhOperation) || !isPlainObject(enOperation)) continue;

      const opKey = `${method.toUpperCase()} ${apiPath}`;
      const zhTags = Array.isArray(zhOperation.tags) ? zhOperation.tags : [];
      const primaryZhTag = typeof zhTags[0] === 'string' ? zhTags[0] : '';
      const moduleMapping = tagToModule.get(primaryZhTag);
      if (moduleMapping === undefined) {
        throw new Error(`Operation ${opKey} has unmapped tag "${primaryZhTag}"`);
      }

      const { module, meta: moduleMeta } = moduleMapping;
      const opTrans = dictionary.operations[opKey];
      if (opTrans === undefined) {
        throw new Error(`Missing operation metadata in en-translations.json for ${opKey}`);
      }
      if (opTrans.module !== module) {
        throw new Error(
          `Module mismatch for ${opKey}: dictionary says "${opTrans.module}", tag maps to "${module}"`
        );
      }

      const baseSlug = deriveOperationBaseSlug({
        module,
        apiPath,
        operation: zhOperation
      });
      const usedSlugs = seenSlugsByModule.get(module) ?? new Set<string>();
      seenSlugsByModule.set(module, usedSlugs);
      const computedSlug = usedSlugs.has(baseSlug) ? `${baseSlug}-${method}` : baseSlug;
      usedSlugs.add(computedSlug);

      const slug = opTrans.slug;
      if (slug !== computedSlug) {
        throw new Error(
          `Locked slug mismatch for ${opKey}: derived "${computedSlug}", dictionary locks "${slug}"`
        );
      }

      // 校验中英文标题、描述长度与全局唯一性。
      if (opTrans.zh.description.trim().length < 20) {
        throw new Error(`Chinese description < 20 chars for ${opKey}`);
      }
      if (opTrans.en.description.trim().length < 60 || opTrans.en.description.trim().length > 160) {
        throw new Error(
          `English description length (${opTrans.en.description.trim().length}) out of [60, 160] for ${opKey}`
        );
      }
      if (existingMeta.zhTitles.has(opTrans.zh.title)) {
        throw new Error(
          `Duplicate zh-CN title "${opTrans.zh.title}" (${opKey} vs ${existingMeta.zhTitles.get(opTrans.zh.title)})`
        );
      }
      if (existingMeta.enTitles.has(opTrans.en.title)) {
        throw new Error(
          `Duplicate en title "${opTrans.en.title}" (${opKey} vs ${existingMeta.enTitles.get(opTrans.en.title)})`
        );
      }
      if (existingMeta.zhDescriptions.has(opTrans.zh.description.trim())) {
        throw new Error(`Duplicate zh-CN description for ${opKey}`);
      }
      if (existingMeta.enDescriptions.has(opTrans.en.description.trim())) {
        throw new Error(`Duplicate en description for ${opKey}`);
      }
      existingMeta.zhTitles.set(opTrans.zh.title, opKey);
      existingMeta.enTitles.set(opTrans.en.title, opKey);
      existingMeta.zhDescriptions.set(opTrans.zh.description.trim(), opKey);
      existingMeta.enDescriptions.set(opTrans.en.description.trim(), opKey);

      const zhFilePath = path.join(REFERENCE_CONTENT_DIR, module, `${slug}.mdx`);
      const enFilePath = path.join(REFERENCE_CONTENT_DIR, module, `${slug}.en.mdx`);
      const completionVersion =
        opKey === 'POST /v1/chat/completions'
          ? 'v1'
          : opKey === 'POST /v2/chat/completions'
            ? 'v2'
            : undefined;

      const rawZhMdx = renderOperationMdx({
        opKey,
        method,
        apiPath,
        module,
        zhTag: primaryZhTag,
        operation: zhOperation,
        opMeta: opTrans.zh,
        moduleMeta,
        locale: 'zh-CN',
        completionExamples:
          completionVersion !== undefined ? completionExamplesZh[completionVersion] : undefined
      });
      const rawEnMdx = renderOperationMdx({
        opKey,
        method,
        apiPath,
        module,
        zhTag: primaryZhTag,
        operation: enOperation,
        opMeta: opTrans.en,
        moduleMeta,
        locale: 'en',
        completionExamples:
          completionVersion !== undefined ? completionExamplesEn[completionVersion] : undefined
      });

      const zhContent = await formatMdx({ raw: rawZhMdx, targetFilePath: zhFilePath });
      const enContent = await formatMdx({ raw: rawEnMdx, targetFilePath: enFilePath });

      if (HAN_REGEX.test(enContent)) {
        throw new Error(`Han characters detected in generated English MDX: ${enFilePath}`);
      }

      modulePageSlugs.get(module)!.push(slug);
      lockedSlugs.push(`/openapi/reference/${module}/${slug}`);
      pages.push({
        opKey,
        method: method.toUpperCase(),
        apiPath,
        module,
        slug,
        urlSlug: `/openapi/reference/${module}/${slug}`,
        deprecated: zhOperation.deprecated === true,
        zhPath: toPosixRelative(DOCUMENT_ROOT, zhFilePath),
        enPath: toPosixRelative(DOCUMENT_ROOT, enFilePath),
        zhContent,
        enContent
      });
    }
  }

  // 5. 生成目录元数据（不包含 root: true，保持侧边栏归属于 developers）。
  const referenceMetaZhJson = `${JSON.stringify(
    {
      title: 'System OpenAPI 参考',
      pages: [...MODULE_ORDER]
    },
    null,
    2
  )}\n`;
  const referenceMetaEnJson = `${JSON.stringify(
    {
      title: 'System OpenAPI Reference',
      pages: [...MODULE_ORDER]
    },
    null,
    2
  )}\n`;

  const moduleMetas: GeneratedArtifact[] = [];
  for (const moduleName of MODULE_ORDER) {
    const meta = dictionary.modules[moduleName];
    const moduleSlugs = modulePageSlugs.get(moduleName) ?? [];
    if (moduleSlugs.length === 0) {
      throw new Error(`Module "${moduleName}" has 0 operations`);
    }
    moduleMetas.push({
      relativePath: toPosixRelative(
        DOCUMENT_ROOT,
        path.join(REFERENCE_CONTENT_DIR, moduleName, 'meta.json')
      ),
      content: `${JSON.stringify({ title: meta.zhTitle, pages: moduleSlugs }, null, 2)}\n`
    });
    const enMetaContent = `${JSON.stringify({ title: meta.enTitle, pages: moduleSlugs }, null, 2)}\n`;
    if (HAN_REGEX.test(enMetaContent)) {
      throw new Error(`Han characters detected in English module meta: ${moduleName}`);
    }
    moduleMetas.push({
      relativePath: toPosixRelative(
        DOCUMENT_ROOT,
        path.join(REFERENCE_CONTENT_DIR, moduleName, 'meta.en.json')
      ),
      content: enMetaContent
    });
  }

  lockedSlugs.sort();

  return {
    zhSpecJson,
    enSpecJson,
    openapiMetaZhJson: buildUpdatedOpenApiMeta(OPENAPI_META_ZH_PATH),
    openapiMetaEnJson: buildUpdatedOpenApiMeta(OPENAPI_META_EN_PATH),
    referenceMetaZhJson,
    referenceMetaEnJson,
    moduleMetas,
    pages,
    lockedSlugs
  };
}

/** 将内容写入磁盘（仅内容变化时覆盖，保证幂等）。 */
const writeFileIfChanged = (filePath: string, content: string) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (fs.existsSync(filePath) && fs.readFileSync(filePath, 'utf8') === content) {
    return false;
  }
  fs.writeFileSync(filePath, content, 'utf8');
  return true;
};

/** 读取指定文件的 git 最近提交时间，或在无记录时回退到仓库 HEAD 提交时间。 */
const getGitIsoTimestamp = (relativeToDocument?: string): string => {
  const args =
    relativeToDocument !== undefined
      ? ['log', '-1', '--format=%aI', '--', relativeToDocument]
      : ['log', '-1', '--format=%aI'];
  try {
    const output = execFileSync('git', args, {
      cwd: DOCUMENT_ROOT,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
    if (output.length > 0) return output;
  } catch {
    // 忽略 git 命令失败并继续回退。
  }
  if (relativeToDocument !== undefined) {
    return getGitIsoTimestamp();
  }
  return new Date().toISOString();
};

/** 执行全量写入：生成文件、清理废弃节点、更新 `doc-last-modified.json` 并刷新 `toc*.mdx`。 */
export async function syncOpenApiDocsToDisk() {
  // 1. 在内存中构建并校验全量生成产物。
  const bundle = await generateOpenApiDocs();
  const expectedReferenceFiles = new Set<string>();

  // 2. 写入双语 OpenAPI 3.1 JSON 契约与导航元数据。
  writeFileIfChanged(ZH_SPEC_PATH, bundle.zhSpecJson);
  writeFileIfChanged(EN_SPEC_PATH, bundle.enSpecJson);
  writeFileIfChanged(OPENAPI_META_ZH_PATH, bundle.openapiMetaZhJson);
  writeFileIfChanged(OPENAPI_META_EN_PATH, bundle.openapiMetaEnJson);

  const refMetaZhRel = toPosixRelative(
    DOCUMENT_ROOT,
    path.join(REFERENCE_CONTENT_DIR, 'meta.json')
  );
  const refMetaEnRel = toPosixRelative(
    DOCUMENT_ROOT,
    path.join(REFERENCE_CONTENT_DIR, 'meta.en.json')
  );
  expectedReferenceFiles.add(refMetaZhRel);
  expectedReferenceFiles.add(refMetaEnRel);
  writeFileIfChanged(path.join(DOCUMENT_ROOT, refMetaZhRel), bundle.referenceMetaZhJson);
  writeFileIfChanged(path.join(DOCUMENT_ROOT, refMetaEnRel), bundle.referenceMetaEnJson);

  for (const modMeta of bundle.moduleMetas) {
    expectedReferenceFiles.add(modMeta.relativePath);
    writeFileIfChanged(path.join(DOCUMENT_ROOT, modMeta.relativePath), modMeta.content);
  }

  for (const page of bundle.pages) {
    expectedReferenceFiles.add(page.zhPath);
    expectedReferenceFiles.add(page.enPath);
    writeFileIfChanged(path.join(DOCUMENT_ROOT, page.zhPath), page.zhContent);
    writeFileIfChanged(path.join(DOCUMENT_ROOT, page.enPath), page.enContent);
  }

  // 3. 清理不再存在的 reference 旧文件与空目录。
  if (fs.existsSync(REFERENCE_CONTENT_DIR)) {
    for (const entry of fs.readdirSync(REFERENCE_CONTENT_DIR, { recursive: true })) {
      const full = path.join(REFERENCE_CONTENT_DIR, String(entry));
      if (!fs.statSync(full).isFile()) continue;
      const rel = toPosixRelative(DOCUMENT_ROOT, full);
      if (!expectedReferenceFiles.has(rel)) {
        fs.unlinkSync(full);
      }
    }
    for (const dirEntry of fs.readdirSync(REFERENCE_CONTENT_DIR, { withFileTypes: true })) {
      if (!dirEntry.isDirectory()) continue;
      const dirPath = path.join(REFERENCE_CONTENT_DIR, dirEntry.name);
      if (fs.readdirSync(dirPath).length === 0) {
        fs.rmdirSync(dirPath);
      }
    }
  }

  // 4. 增量更新 doc-last-modified.json：保留已有时间戳；新增文件采用 git 文件时间或 HEAD 时间保证幂等。
  const existingTimes = fs.existsSync(DOC_LAST_MODIFIED_PATH)
    ? (JSON.parse(fs.readFileSync(DOC_LAST_MODIFIED_PATH, 'utf8')) as Record<string, string>)
    : {};
  const nextTimes: Record<string, string> = {};
  const headTimestamp = getGitIsoTimestamp();

  for (const [key, value] of Object.entries(existingTimes)) {
    if (key.startsWith('content/openapi/reference/') && !expectedReferenceFiles.has(key)) {
      continue;
    }
    if (fs.existsSync(path.join(DOCUMENT_ROOT, key))) {
      nextTimes[key] = value;
    }
  }
  for (const page of bundle.pages) {
    for (const relPath of [page.zhPath, page.enPath]) {
      if (nextTimes[relPath] === undefined) {
        nextTimes[relPath] = getGitIsoTimestamp(relPath) || headTimestamp;
      }
    }
  }

  const sortedTimes = Object.fromEntries(
    Object.entries(nextTimes).sort(([a], [b]) => a.localeCompare(b))
  );
  writeFileIfChanged(DOC_LAST_MODIFIED_PATH, JSON.stringify(sortedTimes, null, 2));

  // 5. 刷新 toc.mdx 与 toc.en.mdx，使目录索引包含新增的 50 组参考页（排除 deprecated 否？generateToc 按 draft 过滤，与现有脚本一致）。
  execFileSync(process.execPath, [path.join(SCRIPT_DIR, 'generateToc.js')], {
    cwd: DOCUMENT_ROOT,
    stdio: 'inherit'
  });

  return bundle;
}

if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  syncOpenApiDocsToDisk()
    .then((bundle) => {
      console.log(
        `✅ OpenAPI docs synced: ${bundle.pages.length} operations (${bundle.pages.length * 2} MDX files) across ${MODULE_ORDER.length} modules.`
      );
    })
    .catch((error) => {
      console.error('❌ Failed to sync OpenAPI docs:', error);
      process.exitCode = 1;
    });
}
