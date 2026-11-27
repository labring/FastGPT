import type {
  IrOperation,
  IrProperty,
  IrRequestObjectSchema,
  IrResourceNode,
  IrSchema,
  SdkIrDocument
} from './irTypes';
import { getIrSchemaSignature } from './schemaNormalizer';

const GO_KEYWORDS = new Set<string>([
  'break',
  'case',
  'chan',
  'const',
  'continue',
  'default',
  'defer',
  'else',
  'fallthrough',
  'for',
  'func',
  'go',
  'goto',
  'if',
  'import',
  'interface',
  'map',
  'package',
  'range',
  'return',
  'select',
  'struct',
  'switch',
  'type',
  'var'
]);

const GO_PREDECLARED_PARAMS = new Set<string>([
  'any',
  'bool',
  'byte',
  'error',
  'float64',
  'int',
  'int64',
  'len',
  'make',
  'new',
  'nil',
  'rune',
  'string'
]);

const GO_INITIALISMS: Record<string, string> = {
  ai: 'AI',
  api: 'API',
  cn: 'CN',
  csv: 'CSV',
  db: 'DB',
  hant: 'Hant',
  http: 'HTTP',
  id: 'ID',
  ids: 'IDs',
  io: 'IO',
  ip: 'IP',
  json: 'JSON',
  kv: 'KV',
  llm: 'LLM',
  op: 'Op',
  pdf: 'PDF',
  qa: 'QA',
  rag: 'RAG',
  rrf: 'RRF',
  sse: 'SSE',
  stt: 'STT',
  tts: 'TTS',
  ui: 'UI',
  uid: 'UID',
  uids: 'UIDs',
  url: 'URL',
  urls: 'URLs',
  vlm: 'VLM'
};

/** 预占 package fastgpt 已有手写符号与运行时辅助函数名，防止生成符号与其冲突。 */
const RESERVED_PACKAGE_SYMBOLS = new Set<string>([
  'APIError',
  'AuthProxy',
  'AuthProxyByTmbID',
  'AuthProxyByUsername',
  'AuthProxyInput',
  'AuthProxyQuery',
  'AuthProxyRaw',
  'AuthProxyString',
  'BinaryInput',
  'Bool',
  'ChatSSEEvent',
  'ChatStream',
  'ChatStreamFinalResult',
  'ChatStreamState',
  'Client',
  'ClientHeaderValue',
  'ClientOption',
  'ErrAPI',
  'ErrAborted',
  'ErrAuth',
  'ErrBadRequest',
  'ErrConflict',
  'ErrNetwork',
  'ErrNotFound',
  'ErrRateLimit',
  'ErrServer',
  'ErrTimeout',
  'ErrorHookContext',
  'FileUpload',
  'Float64',
  'Hooks',
  'Identity',
  'IdentityAuthProxy',
  'IdentityCustomUID',
  'Int',
  'Int64',
  'InteractivePayload',
  'InteractiveService',
  'NewClient',
  'Null',
  'Opt',
  'Pager',
  'PagerOption',
  'RawResponse',
  'RequestHookContext',
  'RequestOption',
  'ResponseHookContext',
  'Some',
  'String',
  'Version',
  'AppsLogsService',
  'AppsService',
  'ChatHistoriesService',
  'ChatRecordsService',
  'ChatService',
  'DatasetsCollectionsService',
  'DatasetsDataService',
  'DatasetsService',
  'ModelsService',
  'marshalWithExtraFields',
  'rawJSONFields',
  'rawJSONHasKey',
  'rawJSONKindIsString',
  'rawJSONStringEquals',
  'unmarshalExtraFields'
]);

const capitalize = (word: string): string =>
  word.length === 0 ? '' : `${word[0]!.toUpperCase()}${word.slice(1)}`;

const splitIdentifierSegments = (input: string): string[] => {
  const spaced = input
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim();
  if (spaced.length === 0) return [];
  return spaced.split(/\s+/);
};

/** 将 camelCase / snake_case / kebab-case / dot-path 转换为符合 Go 惯例的大驼峰标识符。 */
export const toGoPascalCase = (input: string): string => {
  const segments = splitIdentifierSegments(input);
  return segments
    .map((seg) => {
      const lower = seg.toLowerCase();
      return GO_INITIALISMS[lower] ?? capitalize(seg);
    })
    .join('');
};

const toGoParamName = (rawName: string): string => {
  const pascal = toGoPascalCase(rawName.replace(/^_+/, ''));
  if (pascal.length === 0) return 'val';
  const lowerFirst = `${pascal[0]!.toLowerCase()}${pascal.slice(1)}`;
  if (GO_KEYWORDS.has(lowerFirst) || GO_PREDECLARED_PARAMS.has(lowerFirst)) {
    return `${lowerFirst}Val`;
  }
  return lowerFirst;
};

const toGoFieldName = ({
  rawName,
  usedNames
}: {
  rawName: string;
  usedNames: Set<string>;
}): string => {
  const hasLeadingUnderscore = rawName.startsWith('_');
  const trimmed = hasLeadingUnderscore ? rawName.replace(/^_+/, '') : rawName;
  let candidate = toGoPascalCase(trimmed);
  if (candidate.length === 0) {
    candidate = 'Field';
  }
  if (/^[0-9]/.test(candidate)) {
    candidate = `F${candidate}`;
  }
  if (hasLeadingUnderscore) {
    candidate = `${candidate}_`;
  }

  let resolved = candidate;
  let idx = 2;
  while (usedNames.has(resolved)) {
    resolved = `${candidate}${idx}`;
    idx += 1;
  }
  usedNames.add(resolved);
  return resolved;
};

const toGoRequestTypeName = (irReqName: string): string =>
  irReqName.endsWith('Req') ? `${irReqName.slice(0, -3)}Params` : `${irReqName}Params`;

const toGoResourceStructName = (fullPath: string): string =>
  `${fullPath.split('.').map(toGoPascalCase).join('')}Resource`;

const toGoResourceConstructorName = (fullPath: string): string =>
  `new${toGoResourceStructName(fullPath)}`;

const toGoSpecVarName = (operationId: string): string => {
  const parts = operationId.split('.');
  const first = parts[0] ?? 'op';
  const camelFirst = `${first[0]!.toLowerCase()}${first.slice(1)}`;
  const rest = parts.slice(1).map(toGoPascalCase).join('');
  return `${camelFirst}${rest}Spec`;
};

const toGoStringLiteral = (raw: string): string =>
  JSON.stringify(raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n'));

const formatGoDocComment = ({
  lines,
  deprecated = false,
  indent = ''
}: {
  lines: Array<string | undefined>;
  deprecated?: boolean;
  indent?: string;
}): string => {
  const cleaned = lines
    .filter((line): line is string => line !== undefined && line.trim().length > 0)
    .flatMap((line) => line.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n'))
    .map((line) => line.trimEnd());

  if (deprecated) {
    if (cleaned.length > 0) {
      cleaned.push('');
    }
    cleaned.push('Deprecated: this field is marked deprecated in the FastGPT OpenAPI spec.');
  }

  if (cleaned.length === 0) return '';
  return `${cleaned
    .map((line) => (line.length > 0 ? `${indent}// ${line}` : `${indent}//`))
    .join('\n')}\n`;
};

const formatMarkerMethod = ({ receiver, method }: { receiver: string; method: string }): string => {
  const oneLine = `func (${receiver}) ${method} {}`;
  return oneLine.length > 102 ? `func (${receiver}) ${method} {\n}` : oneLine;
};

type StructFieldEntry =
  | { kind: 'comment'; text: string }
  | { kind: 'blank' }
  | { kind: 'field'; name: string; typeExpr: string; tag: string };

/** 按 gofmt 结构对齐规则格式化结构体字段分组。 */
const renderAlignedStruct = ({
  structName,
  doc,
  entries
}: {
  structName: string;
  doc?: string;
  entries: StructFieldEntry[];
}): string => {
  const outLines: string[] = [];
  if (doc !== undefined && doc.length > 0) {
    outLines.push(doc.trimEnd());
  }
  outLines.push(`type ${structName} struct {`);

  let idx = 0;
  while (idx < entries.length) {
    const entry = entries[idx]!;
    if (entry.kind === 'comment') {
      outLines.push(entry.text.trimEnd());
      idx += 1;
      continue;
    }
    if (entry.kind === 'blank') {
      outLines.push('');
      idx += 1;
      continue;
    }

    const run: Array<Extract<StructFieldEntry, { kind: 'field' }>> = [];
    while (idx < entries.length && entries[idx]!.kind === 'field') {
      run.push(entries[idx] as Extract<StructFieldEntry, { kind: 'field' }>);
      idx += 1;
    }

    const maxNameLen = Math.max(...run.map((f) => f.name.length));
    const taggedFields = run.filter((f) => f.tag.length > 0);
    const maxTaggedTypeLen =
      taggedFields.length > 0 ? Math.max(...taggedFields.map((f) => f.typeExpr.length)) : 0;

    for (const f of run) {
      if (f.tag.length > 0) {
        outLines.push(
          `\t${f.name.padEnd(maxNameLen)} ${f.typeExpr.padEnd(maxTaggedTypeLen)} ${f.tag}`
        );
      } else {
        outLines.push(`\t${f.name.padEnd(maxNameLen)} ${f.typeExpr}`);
      }
    }
  }

  outLines.push('}');
  return outLines.join('\n');
};

const renderAlignedCompositeLiteral = ({
  typeName,
  varName,
  fields
}: {
  typeName: string;
  varName: string;
  fields: Array<{ key: string; value: string }>;
}): string => {
  const maxKeyColonLen = Math.max(...fields.map((f) => f.key.length + 1));
  const body = fields.map((f) => `\t${`${f.key}:`.padEnd(maxKeyColonLen)} ${f.value},`).join('\n');
  return `var ${varName} = ${typeName}{\n${body}\n}`;
};

const formatGoImportBlock = (imports: Iterable<string>): string => {
  const sorted = [...new Set(imports)].sort();
  if (sorted.length === 0) return '';
  if (sorted.length === 1) {
    return `import ${toGoStringLiteral(sorted[0]!)}`;
  }
  return `import (\n${sorted.map((pkg) => `\t${toGoStringLiteral(pkg)}`).join('\n')}\n)`;
};

const renderGoFile = ({
  imports,
  blocks
}: {
  imports: Iterable<string>;
  blocks: string[];
}): string => {
  const header = [
    '// Code generated by @fastgpt-sdk/openapi-codegen. DO NOT EDIT.',
    '',
    'package fastgpt'
  ];
  const importBlock = formatGoImportBlock(imports);
  const parts = [header.join('\n')];
  if (importBlock.length > 0) {
    parts.push(importBlock);
  }
  parts.push(...blocks);
  return `${parts.join('\n\n')}\n`;
};

const isNullIrSchema = (schema: IrSchema): boolean =>
  schema.kind === 'primitive' && schema.type === 'null';

const splitNullableUnion = (
  variants: IrSchema[]
): { isNullable: boolean; nonNullVariants: IrSchema[] } => {
  const hasNull = variants.some(isNullIrSchema);
  const nonNullVariants = variants.filter((v) => !isNullIrSchema(v));
  return { isNullable: hasNull, nonNullVariants };
};

const isGoNilableType = (typeExpr: string): boolean =>
  typeExpr.startsWith('[]') || typeExpr.startsWith('map[') || typeExpr === 'any';

const isStringTupleSchema = (schema: IrSchema): boolean =>
  schema.kind === 'tuple' &&
  schema.items.length === 2 &&
  schema.items.every((item) => item.kind === 'primitive' && item.type === 'string');

const stripSchemaMetaForSig = (schema: IrSchema): IrSchema => {
  switch (schema.kind) {
    case 'primitive':
      return { kind: 'primitive', type: schema.type };
    case 'literal':
      return { kind: 'literal', value: schema.value };
    case 'enum':
      return { kind: 'enum', values: schema.values };
    case 'binary':
      return {
        kind: 'binary',
        ...(schema.multiple === true ? { multiple: true } : {})
      };
    case 'array':
      return { kind: 'array', items: stripSchemaMetaForSig(schema.items) };
    case 'tuple':
      return { kind: 'tuple', items: schema.items.map(stripSchemaMetaForSig) };
    case 'record':
      return { kind: 'record', valueType: stripSchemaMetaForSig(schema.valueType) };
    case 'union':
      return { kind: 'union', variants: schema.variants.map(stripSchemaMetaForSig) };
    case 'object':
      return {
        kind: 'object',
        properties: schema.properties.map((p) => ({
          name: p.name,
          required: p.required,
          schema: stripSchemaMetaForSig(p.schema)
        })),
        ...(schema.additionalProperties !== undefined
          ? {
              additionalProperties:
                typeof schema.additionalProperties === 'object'
                  ? stripSchemaMetaForSig(schema.additionalProperties)
                  : schema.additionalProperties
            }
          : {})
      };
    default:
      return { kind: schema.kind };
  }
};

const getConceptDedupeKey = ({
  direction,
  concept,
  schema
}: {
  direction: 'input' | 'output';
  concept: string;
  schema: IrSchema;
}): string => `${direction}:${concept}:${getIrSchemaSignature(stripSchemaMetaForSig(schema))}`;

type ModelEmitState = {
  direction: 'input' | 'output';
  dedupeMap: Map<string, string>;
  usedTypeNames: Set<string>;
  definitions: string[];
  usedImports: Set<string>;
  usesRawJSONHelpers: boolean;
  usesExtraPropsHelpers: boolean;
  chatPartTypeCache: Map<string, string>;
};

const reserveUniqueTypeName = ({
  preferredName,
  usedTypeNames
}: {
  preferredName: string;
  usedTypeNames: Set<string>;
}): string => {
  let candidate = preferredName.length > 0 ? preferredName : 'AnonymousModel';
  if (/^[0-9]/.test(candidate)) {
    candidate = `Model${candidate}`;
  }
  if (!usedTypeNames.has(candidate)) {
    usedTypeNames.add(candidate);
    return candidate;
  }
  let idx = 2;
  while (usedTypeNames.has(`${candidate}${idx}`)) {
    idx += 1;
  }
  const unique = `${candidate}${idx}`;
  usedTypeNames.add(unique);
  return unique;
};

const formatAllowedValuesNote = (schema: IrSchema): string | undefined => {
  if (schema.kind === 'enum') {
    return `Allowed values: ${schema.values.map((v) => JSON.stringify(v)).join(', ')}.`;
  }
  if (schema.kind === 'literal') {
    return `Fixed literal value: ${JSON.stringify(schema.value)}.`;
  }
  return undefined;
};

const isAuthProxyBodyUnion = (schema: IrSchema): boolean => {
  if (schema.kind !== 'union' || schema.variants.length !== 2) return false;
  const keys = schema.variants
    .map((v) =>
      v.kind === 'object' && v.properties.length === 1 ? v.properties[0]!.name : undefined
    )
    .sort();
  return keys[0] === 'tmbId' && keys[1] === 'username';
};

const isAuthProxyQueryUnion = (schema: IrSchema): boolean => {
  if (schema.kind !== 'union' || schema.variants.length !== 3) return false;
  const hasTmb = schema.variants.some(
    (v) => v.kind === 'object' && v.properties.length === 1 && v.properties[0]!.name === 'tmbId'
  );
  const hasUser = schema.variants.some(
    (v) => v.kind === 'object' && v.properties.length === 1 && v.properties[0]!.name === 'username'
  );
  const hasStr = schema.variants.some((v) => v.kind === 'primitive' && v.type === 'string');
  return hasTmb && hasUser && hasStr;
};

const isDatasetTagUnion = (schema: IrSchema): boolean => {
  if (schema.kind !== 'union' || schema.variants.length !== 2) return false;
  const hasString = schema.variants.some((v) => v.kind === 'primitive' && v.type === 'string');
  const hasTagObj = schema.variants.some(
    (v) =>
      v.kind === 'object' &&
      v.properties.some((p) => p.name === 'tag') &&
      v.properties.some((p) => p.name === 'value')
  );
  return hasString && hasTagObj;
};

const isChatMessagesUnion = (schema: IrSchema): boolean => {
  if (schema.kind !== 'union' || schema.variants.length < 4) return false;
  return schema.variants.every(
    (v) =>
      v.kind === 'object' &&
      v.properties.some(
        (p) =>
          p.name === 'role' && p.schema.kind === 'literal' && typeof p.schema.value === 'string'
      )
  );
};

const isChatSimpleContentUnion = (schema: IrSchema): boolean => {
  if (schema.kind !== 'union' || schema.variants.length !== 2) return false;
  const hasStr = schema.variants.some((v) => v.kind === 'primitive' && v.type === 'string');
  const arr = schema.variants.find((v) => v.kind === 'array');
  return (
    hasStr &&
    arr !== undefined &&
    arr.kind === 'array' &&
    arr.items.kind === 'object' &&
    arr.items.properties.some(
      (p) => p.name === 'type' && p.schema.kind === 'literal' && p.schema.value === 'text'
    )
  );
};

const isChatSelectUnion = (schema: IrSchema): boolean => {
  if (schema.kind !== 'union' || schema.variants.length !== 4) return false;
  return schema.variants.some(
    (v) =>
      v.kind === 'object' &&
      v.properties.some(
        (p) => p.name === 'type' && p.schema.kind === 'literal' && p.schema.value === 'agentAsk'
      )
  );
};

const isPrimitiveStringEnumUnion = (schema: IrSchema): boolean => {
  if (schema.kind !== 'union' || schema.variants.length !== 2) return false;
  const hasString = schema.variants.some((v) => v.kind === 'primitive' && v.type === 'string');
  const hasStringEnum = schema.variants.some(
    (v) => v.kind === 'enum' && v.values.every((val) => typeof val === 'string')
  );
  return hasString && hasStringEnum;
};

const isDatasetsSearchTagFilterUnion = (schema: IrSchema): boolean => {
  if (schema.kind !== 'union' || schema.variants.length !== 5) return false;
  return schema.variants.every(
    (v) =>
      v.kind === 'object' &&
      v.properties.some((p) => p.name === 'tag') &&
      v.properties.some((p) => p.name === 'op' && p.schema.kind === 'enum')
  );
};

const isQuoteItemUnion = (schema: IrSchema): boolean => {
  if (schema.kind !== 'union' || schema.variants.length !== 2) return false;
  const [v0, v1] = schema.variants;
  return (
    v0?.kind === 'object' &&
    v1?.kind === 'object' &&
    v0.properties.some((p) => p.name === 'q' && p.required) &&
    !v1.properties.some((p) => p.name === 'q') &&
    v1.properties.some((p) => p.name === 'chunkIndex')
  );
};

const emitObjectStruct = ({
  structName,
  properties,
  additionalProperties,
  docLines,
  deprecated = false,
  state,
  forcedLiterals = []
}: {
  structName: string;
  properties: IrProperty[];
  additionalProperties?: boolean | IrSchema;
  docLines?: Array<string | undefined>;
  deprecated?: boolean;
  state: ModelEmitState;
  forcedLiterals?: Array<{ fieldName: string; valueExpr: string }>;
}): void => {
  const usedNames = new Set<string>();
  const hasExtraProps =
    state.direction === 'output' &&
    additionalProperties !== undefined &&
    additionalProperties !== false;
  if (hasExtraProps) {
    usedNames.add('AdditionalProperties');
  }

  const fieldEntries: StructFieldEntry[] = [];
  const knownWireKeys: string[] = [];

  for (const prop of properties) {
    if (prop.schema.kind === 'never') {
      continue;
    }

    knownWireKeys.push(prop.name);
    const goFieldName = toGoFieldName({ rawName: prop.name, usedNames });

    const { typeExpr, wireTag, extraNote } = resolvePropertyGoField({
      prop,
      fieldHint: `${structName}${goFieldName}`,
      state
    });

    const fieldDoc = formatGoDocComment({
      lines: [prop.description, extraNote],
      deprecated: prop.deprecated === true,
      indent: '\t'
    });
    if (fieldDoc.length > 0) {
      for (const commentLine of fieldDoc.trimEnd().split('\n')) {
        fieldEntries.push({ kind: 'comment', text: commentLine });
      }
    }

    fieldEntries.push({
      kind: 'field',
      name: goFieldName,
      typeExpr,
      tag: wireTag
    });
  }

  if (hasExtraProps) {
    fieldEntries.push({
      kind: 'comment',
      text: '\t// AdditionalProperties holds any extra unrecognized JSON fields returned by the server.'
    });
    fieldEntries.push({
      kind: 'field',
      name: 'AdditionalProperties',
      typeExpr: 'map[string]any',
      tag: '`json:"-"`'
    });
  }

  const formattedDoc =
    docLines !== undefined ? formatGoDocComment({ lines: docLines, deprecated }) : '';
  const structCode = renderAlignedStruct({
    structName,
    doc: formattedDoc,
    entries: fieldEntries
  });
  state.definitions.push(structCode);

  if (forcedLiterals.length > 0) {
    state.usedImports.add('encoding/json');
    const aliasName = `raw${structName}`;
    const assignLines = forcedLiterals.map((lit) => `\tout.${lit.fieldName} = ${lit.valueExpr}`);
    state.definitions.push(
      [
        `func (v ${structName}) MarshalJSON() ([]byte, error) {`,
        `\ttype ${aliasName} ${structName}`,
        `\tout := ${aliasName}(v)`,
        ...assignLines,
        '\treturn json.Marshal(out)',
        '}'
      ].join('\n')
    );
  }

  if (hasExtraProps) {
    state.usedImports.add('encoding/json');
    state.usedImports.add('errors');
    state.usesExtraPropsHelpers = true;
    const aliasName = `raw${structName}`;
    const knownVarName = `${structName[0]!.toLowerCase()}${structName.slice(1)}KnownKeys`;
    const quotedKeys = knownWireKeys.map(toGoStringLiteral);
    const maxKnownKeyColon = Math.max(...quotedKeys.map((k) => k.length + 1));
    const keyEntries = quotedKeys
      .map((k) => `\t${`${k}:`.padEnd(maxKnownKeyColon)} {},`)
      .join('\n');
    state.definitions.push(
      [
        `var ${knownVarName} = map[string]struct{}{`,
        keyEntries,
        '}',
        '',
        `func (v *${structName}) UnmarshalJSON(data []byte) error {`,
        '\tif v == nil {',
        `\t\treturn errors.New(${toGoStringLiteral(`fastgpt.${structName}: UnmarshalJSON on nil pointer`)})`,
        '\t}',
        `\ttype ${aliasName} ${structName}`,
        `\tvar plain ${aliasName}`,
        `\textra, err := unmarshalExtraFields(data, &plain, ${knownVarName})`,
        '\tif err != nil {',
        '\t\treturn err',
        '\t}',
        '\tplain.AdditionalProperties = extra',
        `\t*v = ${structName}(plain)`,
        '\treturn nil',
        '}',
        '',
        `func (v ${structName}) MarshalJSON() ([]byte, error) {`,
        `\ttype ${aliasName} ${structName}`,
        `\treturn marshalWithExtraFields(${aliasName}(v), v.AdditionalProperties)`,
        '}'
      ].join('\n')
    );
  }
};

const resolvePropertyGoField = ({
  prop,
  fieldHint,
  state
}: {
  prop: IrProperty;
  fieldHint: string;
  state: ModelEmitState;
}): { typeExpr: string; wireTag: string; extraNote?: string } => {
  const note = formatAllowedValuesNote(prop.schema);

  if (state.direction === 'input') {
    if (prop.schema.kind === 'union') {
      const { isNullable, nonNullVariants } = splitNullableUnion(prop.schema.variants);
      if (isNullable) {
        const innerSchema: IrSchema =
          nonNullVariants.length === 1
            ? nonNullVariants[0]!
            : { kind: 'union', variants: nonNullVariants };
        const innerType = renderSchemaToGoType({
          schema: innerSchema,
          hintName: fieldHint,
          concept: prop.name,
          state
        });
        const tag = prop.required ? `\`json:"${prop.name}"\`` : `\`json:"${prop.name},omitzero"\``;
        return { typeExpr: `Opt[${innerType}]`, wireTag: tag, extraNote: note };
      }
    }

    const baseType = renderSchemaToGoType({
      schema: prop.schema,
      hintName: fieldHint,
      concept: prop.name,
      state
    });

    if (!prop.required) {
      return {
        typeExpr: `Opt[${baseType}]`,
        wireTag: `\`json:"${prop.name},omitzero"\``,
        extraNote: note
      };
    }

    return {
      typeExpr: baseType,
      wireTag: `\`json:"${prop.name}"\``,
      extraNote: note
    };
  }

  // Output / response field
  if (prop.schema.kind === 'union') {
    const { isNullable, nonNullVariants } = splitNullableUnion(prop.schema.variants);
    if (isNullable && nonNullVariants.length === 1) {
      const innerType = renderSchemaToGoType({
        schema: nonNullVariants[0]!,
        hintName: fieldHint,
        concept: prop.name,
        state
      });
      const outType = isGoNilableType(innerType) ? innerType : `*${innerType}`;
      const tag = prop.required ? `\`json:"${prop.name}"\`` : `\`json:"${prop.name},omitempty"\``;
      return { typeExpr: outType, wireTag: tag, extraNote: note };
    }
  }

  const baseType = renderSchemaToGoType({
    schema: prop.schema,
    hintName: fieldHint,
    concept: prop.name,
    state
  });
  if (!prop.required) {
    const outType = isGoNilableType(baseType) ? baseType : `*${baseType}`;
    return {
      typeExpr: outType,
      wireTag: `\`json:"${prop.name},omitempty"\``,
      extraNote: note
    };
  }

  return {
    typeExpr: baseType,
    wireTag: `\`json:"${prop.name}"\``,
    extraNote: note
  };
};

const renderLiteralGoType = (value: string | number | boolean): string => {
  if (typeof value === 'boolean') return 'bool';
  if (typeof value === 'number') return Number.isInteger(value) ? 'int' : 'float64';
  return 'string';
};

const renderLiteralGoExpr = (value: string | number | boolean): string => {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  return toGoStringLiteral(value);
};

const renderSchemaToGoType = ({
  schema,
  hintName,
  concept,
  state,
  allowReuse = true
}: {
  schema: IrSchema;
  hintName: string;
  concept: string;
  state: ModelEmitState;
  allowReuse?: boolean;
}): string => {
  switch (schema.kind) {
    case 'primitive': {
      switch (schema.type) {
        case 'string':
          return 'string';
        case 'integer':
          return schema.format === 'int64' ? 'int64' : 'int';
        case 'number':
          return 'float64';
        case 'boolean':
          return 'bool';
        case 'null':
          return 'any';
      }
    }
    case 'literal':
      return renderLiteralGoType(schema.value);
    case 'enum': {
      const hasString = schema.values.some((v) => typeof v === 'string');
      if (hasString) return 'string';
      const hasFloat = schema.values.some((v) => typeof v === 'number' && !Number.isInteger(v));
      if (hasFloat) return 'float64';
      const hasInt = schema.values.some((v) => typeof v === 'number');
      if (hasInt) return 'int';
      return 'bool';
    }
    case 'binary':
      return state.direction === 'output' ? '[]byte' : 'FileUpload';
    case 'never':
      return 'struct{}';
    case 'unknown':
      return 'any';
    case 'array': {
      const itemType = renderSchemaToGoType({
        schema: schema.items,
        hintName: `${hintName}Item`,
        concept: `${concept}Item`,
        state
      });
      return `[]${itemType}`;
    }
    case 'tuple': {
      if (isStringTupleSchema(schema)) {
        return '[2]string';
      }
      return '[]any';
    }
    case 'record': {
      const valType = renderSchemaToGoType({
        schema: schema.valueType,
        hintName: `${hintName}Value`,
        concept: `${concept}Value`,
        state
      });
      return `map[string]${valType}`;
    }
    case 'union': {
      if (isPrimitiveStringEnumUnion(schema)) {
        return 'string';
      }
      if (state.direction === 'input') {
        return emitInputUnion({ schema, hintName, concept, state });
      }
      return emitOutputUnion({ schema, hintName, concept, state, allowReuse });
    }
    case 'object': {
      if (schema.properties.length === 0) {
        if (
          schema.additionalProperties !== undefined &&
          typeof schema.additionalProperties === 'object'
        ) {
          const valType = renderSchemaToGoType({
            schema: schema.additionalProperties,
            hintName: `${hintName}Value`,
            concept: `${concept}Value`,
            state
          });
          return `map[string]${valType}`;
        }
        return 'map[string]any';
      }

      const dedupeKey = getConceptDedupeKey({
        direction: state.direction,
        concept,
        schema
      });
      if (allowReuse && state.dedupeMap.has(dedupeKey)) {
        return state.dedupeMap.get(dedupeKey)!;
      }

      const structName = reserveUniqueTypeName({
        preferredName: hintName,
        usedTypeNames: state.usedTypeNames
      });
      if (allowReuse) {
        state.dedupeMap.set(dedupeKey, structName);
      }

      emitObjectStruct({
        structName,
        properties: schema.properties,
        additionalProperties: schema.additionalProperties,
        docLines: [schema.description],
        deprecated: schema.deprecated === true,
        state
      });
      return structName;
    }
  }
};

/** 发射共享的 chat content 文本与 part 基础类型。 */
const ensureChatTextType = (state: ModelEmitState): string => {
  const cacheKey = 'ChatContentText';
  if (state.chatPartTypeCache.has(cacheKey)) {
    return state.chatPartTypeCache.get(cacheKey)!;
  }
  state.usedTypeNames.add(cacheKey);
  state.chatPartTypeCache.set(cacheKey, cacheKey);
  state.definitions.push(
    [
      '// ChatContentText represents a plain string message content payload.',
      'type ChatContentText string',
      '',
      '// ChatText constructs a string message content accepted by system, developer, user, assistant, and tool messages.',
      'func ChatText(text string) ChatContentText {',
      '\treturn ChatContentText(text)',
      '}'
    ].join('\n')
  );
  return cacheKey;
};

const ensureSharedChatTextPart = ({
  schema,
  state
}: {
  schema: IrRequestObjectSchema;
  state: ModelEmitState;
}): string => {
  const cacheKey = 'ChatTextPart';
  if (state.chatPartTypeCache.has(cacheKey)) {
    return state.chatPartTypeCache.get(cacheKey)!;
  }
  state.usedTypeNames.add(cacheKey);
  state.chatPartTypeCache.set(cacheKey, cacheKey);
  emitObjectStruct({
    structName: cacheKey,
    properties: schema.properties,
    docLines: ['ChatTextPart represents a text content part inside a chat message.'],
    state,
    forcedLiterals: [{ fieldName: 'Type', valueExpr: '"text"' }]
  });
  state.definitions.push(
    [
      '// TextPart constructs a text content part.',
      'func TextPart(text string) ChatTextPart {',
      '\treturn ChatTextPart{Type: "text", Text: text}',
      '}'
    ].join('\n')
  );
  return cacheKey;
};

const ensureSharedChatImagePart = ({
  schema,
  state
}: {
  schema: IrRequestObjectSchema;
  state: ModelEmitState;
}): string => {
  const cacheKey = 'ChatImageURLPart';
  if (state.chatPartTypeCache.has(cacheKey)) {
    return state.chatPartTypeCache.get(cacheKey)!;
  }
  state.usedTypeNames.add(cacheKey);
  state.chatPartTypeCache.set(cacheKey, cacheKey);
  emitObjectStruct({
    structName: cacheKey,
    properties: schema.properties,
    docLines: [
      'ChatImageURLPart represents an image URL content part inside a user or tool message.'
    ],
    state,
    forcedLiterals: [{ fieldName: 'Type', valueExpr: '"image_url"' }]
  });
  state.definitions.push(
    [
      '// ImageURLPart constructs an image URL content part.',
      'func ImageURLPart(url string) ChatImageURLPart {',
      '\treturn ChatImageURLPart{Type: "image_url", ImageURL: ChatImageURLPartImageURL{URL: url}}',
      '}'
    ].join('\n')
  );
  return cacheKey;
};

const ensureAuthProxyInput = (state: ModelEmitState): string => {
  const cacheKey = 'AuthProxyInput';
  if (state.chatPartTypeCache.has(cacheKey)) {
    return state.chatPartTypeCache.get(cacheKey)!;
  }
  state.chatPartTypeCache.set(cacheKey, cacheKey);
  state.definitions.push(
    [
      '// AuthProxyInput represents a structured AuthProxy or raw string authProxy query value.',
      'type AuthProxyInput interface {',
      '\tisAuthProxyInput()',
      '}',
      '',
      'func (AuthProxy) isAuthProxyInput() {}',
      '',
      '// AuthProxyRaw wraps a raw string authProxy query value.',
      'type AuthProxyRaw string',
      '',
      'func (AuthProxyRaw) isAuthProxyInput() {}',
      '',
      '// AuthProxyQuery wraps a structured AuthProxy as an optional AuthProxyInput.',
      'func AuthProxyQuery(ap AuthProxy) Opt[AuthProxyInput] {',
      '\treturn Some[AuthProxyInput](ap)',
      '}',
      '',
      '// AuthProxyString wraps a raw authProxy string as an optional AuthProxyInput.',
      'func AuthProxyString(raw string) Opt[AuthProxyInput] {',
      '\treturn Some[AuthProxyInput](AuthProxyRaw(raw))',
      '}'
    ].join('\n')
  );
  return cacheKey;
};

const ensureDatasetTagInput = (state: ModelEmitState): string => {
  const cacheKey = 'DatasetCollectionTagInput';
  if (state.chatPartTypeCache.has(cacheKey)) {
    return state.chatPartTypeCache.get(cacheKey)!;
  }
  state.usedTypeNames.add(cacheKey);
  state.usedTypeNames.add('DatasetTagName');
  state.usedTypeNames.add('DatasetTagKV');
  state.usedTypeNames.add('DatasetTagValue');
  state.usedTypeNames.add('DatasetTagStringValue');
  state.usedTypeNames.add('DatasetTagNumberValue');
  state.usedTypeNames.add('DatasetTagStringListValue');
  state.usedTypeNames.add('TagName');
  state.usedTypeNames.add('TagKV');
  state.usedTypeNames.add('TagString');
  state.usedTypeNames.add('TagNumber');
  state.usedTypeNames.add('TagStrings');
  state.chatPartTypeCache.set(cacheKey, cacheKey);

  state.definitions.push(
    [
      '// DatasetCollectionTagInput represents a collection tag in either legacy string or {tag, value} form.',
      'type DatasetCollectionTagInput interface {',
      '\tisDatasetCollectionTagInput()',
      '}',
      '',
      '// DatasetTagValue represents a tag value (string, number, or []string).',
      'type DatasetTagValue interface {',
      '\tisDatasetTagValue()',
      '}',
      '',
      '// DatasetTagStringValue wraps a string tag value.',
      'type DatasetTagStringValue string',
      '',
      'func (DatasetTagStringValue) isDatasetTagValue() {}',
      '',
      '// DatasetTagNumberValue wraps a numeric tag value.',
      'type DatasetTagNumberValue float64',
      '',
      'func (DatasetTagNumberValue) isDatasetTagValue() {}',
      '',
      '// DatasetTagStringListValue wraps a string-slice tag value.',
      'type DatasetTagStringListValue []string',
      '',
      'func (DatasetTagStringListValue) isDatasetTagValue() {}',
      '',
      '// TagString constructs a string DatasetTagValue.',
      'func TagString(val string) DatasetTagStringValue {',
      '\treturn DatasetTagStringValue(val)',
      '}',
      '',
      '// TagNumber constructs a numeric DatasetTagValue.',
      'func TagNumber(val float64) DatasetTagNumberValue {',
      '\treturn DatasetTagNumberValue(val)',
      '}',
      '',
      '// TagStrings constructs a string-slice DatasetTagValue.',
      'func TagStrings(vals ...string) DatasetTagStringListValue {',
      '\treturn DatasetTagStringListValue(vals)',
      '}',
      '',
      '// DatasetTagName represents a legacy string collection tag.',
      'type DatasetTagName string',
      '',
      'func (DatasetTagName) isDatasetCollectionTagInput() {}',
      '',
      '// TagName constructs a legacy string collection tag.',
      'func TagName(name string) DatasetTagName {',
      '\treturn DatasetTagName(name)',
      '}',
      '',
      '// DatasetTagKV represents a structured {tag, value} collection tag.',
      'type DatasetTagKV struct {',
      '\tTag   string          `json:"tag"`',
      '\tValue DatasetTagValue `json:"value"`',
      '}',
      '',
      'func (DatasetTagKV) isDatasetCollectionTagInput() {}',
      '',
      '// TagKV constructs a structured {tag, value} collection tag.',
      'func TagKV(tag string, value DatasetTagValue) DatasetTagKV {',
      '\treturn DatasetTagKV{Tag: tag, Value: value}',
      '}'
    ].join('\n')
  );
  return cacheKey;
};

const emitChatCompletionsMessages = ({
  schema,
  state
}: {
  schema: Extract<IrSchema, { kind: 'union' }>;
  state: ModelEmitState;
}): string => {
  const ifaceName = 'ChatMessage';
  if (state.chatPartTypeCache.has(ifaceName)) {
    return state.chatPartTypeCache.get(ifaceName)!;
  }
  state.usedTypeNames.add(ifaceName);
  state.chatPartTypeCache.set(ifaceName, ifaceName);

  const marker = `is${ifaceName}()`;
  state.definitions.push(
    [
      '// ChatMessage represents a message in a chat.completionsV2 request.',
      `type ${ifaceName} interface {`,
      `\t${marker}`,
      '}'
    ].join('\n')
  );

  ensureChatTextType(state);

  const roleStructName = (role: string): string => `Chat${toGoPascalCase(role)}Message`;

  for (const variant of schema.variants) {
    if (variant.kind !== 'object') continue;
    const roleProp = variant.properties.find(
      (p) => p.name === 'role' && p.schema.kind === 'literal' && typeof p.schema.value === 'string'
    );
    const role =
      roleProp !== undefined && roleProp.schema.kind === 'literal'
        ? String(roleProp.schema.value)
        : 'unknown';
    const structName = reserveUniqueTypeName({
      preferredName: roleStructName(role),
      usedTypeNames: state.usedTypeNames
    });

    const contentProp = variant.properties.find((p) => p.name === 'content');
    const customProps = variant.properties.filter((p) => p.name !== 'content');
    const usedNames = new Set<string>();
    const entries: StructFieldEntry[] = [];

    for (const prop of variant.properties) {
      if (prop.schema.kind === 'never') continue;
      const goFieldName = toGoFieldName({ rawName: prop.name, usedNames });

      if (prop.name === 'content' && contentProp !== undefined) {
        if (role === 'system' || role === 'developer') {
          const contentIface = emitChatSimpleContent({ schema: prop.schema, state });
          entries.push({
            kind: 'field',
            name: goFieldName,
            typeExpr: contentIface,
            tag: '`json:"content"`'
          });
        } else if (role === 'user') {
          const contentIface = emitChatUserContent({ schema: prop.schema, state });
          entries.push({
            kind: 'field',
            name: goFieldName,
            typeExpr: contentIface,
            tag: '`json:"content"`'
          });
        } else if (role === 'assistant') {
          const contentIface = emitChatAssistantContent({ schema: prop.schema, state });
          entries.push({
            kind: 'field',
            name: goFieldName,
            typeExpr: `Opt[${contentIface}]`,
            tag: '`json:"content,omitzero"`'
          });
        } else if (role === 'tool') {
          const contentIface = emitChatToolContent({ schema: prop.schema, state });
          entries.push({
            kind: 'field',
            name: goFieldName,
            typeExpr: contentIface,
            tag: '`json:"content"`'
          });
        } else {
          const resolved = resolvePropertyGoField({
            prop,
            fieldHint: `${structName}${goFieldName}`,
            state
          });
          entries.push({
            kind: 'field',
            name: goFieldName,
            typeExpr: resolved.typeExpr,
            tag: resolved.wireTag
          });
        }
        continue;
      }

      const resolved = resolvePropertyGoField({
        prop,
        fieldHint: `${structName}${goFieldName}`,
        state
      });
      const fieldDoc = formatGoDocComment({
        lines: [prop.description, resolved.extraNote],
        deprecated: prop.deprecated === true,
        indent: '\t'
      });
      if (fieldDoc.length > 0) {
        for (const commentLine of fieldDoc.trimEnd().split('\n')) {
          entries.push({ kind: 'comment', text: commentLine });
        }
      }
      entries.push({
        kind: 'field',
        name: goFieldName,
        typeExpr: resolved.typeExpr,
        tag: resolved.wireTag
      });
    }
    void customProps;

    state.definitions.push(
      renderAlignedStruct({
        structName,
        doc: formatGoDocComment({
          lines: [`${structName} represents a "${role}" role chat message.`]
        }),
        entries
      })
    );

    state.usedImports.add('encoding/json');
    const aliasName = `raw${structName}`;
    state.definitions.push(
      [
        formatMarkerMethod({ receiver: structName, method: marker }),
        '',
        `func (v ${structName}) MarshalJSON() ([]byte, error) {`,
        `\ttype ${aliasName} ${structName}`,
        `\tout := ${aliasName}(v)`,
        `\tout.Role = ${toGoStringLiteral(role)}`,
        '\treturn json.Marshal(out)',
        '}'
      ].join('\n')
    );

    // Emit idiomatic convenience constructors
    if (role === 'system') {
      state.definitions.push(
        [
          `// SystemMessage constructs a system chat message with text content.`,
          `func SystemMessage(content string) ${structName} {`,
          `\treturn ${structName}{Role: "system", Content: ChatText(content)}`,
          '}'
        ].join('\n')
      );
    } else if (role === 'developer') {
      state.definitions.push(
        [
          `// DeveloperMessage constructs a developer chat message with text content.`,
          `func DeveloperMessage(content string) ${structName} {`,
          `\treturn ${structName}{Role: "developer", Content: ChatText(content)}`,
          '}'
        ].join('\n')
      );
    } else if (role === 'user') {
      state.definitions.push(
        [
          `// UserMessage constructs a user chat message with text content.`,
          `func UserMessage(content string) ${structName} {`,
          `\treturn ${structName}{Role: "user", Content: ChatText(content)}`,
          '}',
          '',
          `// UserMessageParts constructs a user chat message with multimodal content parts.`,
          `func UserMessageParts(parts ...ChatUserContentPart) ${structName} {`,
          `\treturn ${structName}{Role: "user", Content: ChatUserContentParts(parts)}`,
          '}'
        ].join('\n')
      );
    } else if (role === 'assistant') {
      state.definitions.push(
        [
          `// AssistantMessage constructs an assistant chat message with text content.`,
          `func AssistantMessage(content string) ${structName} {`,
          `\treturn ${structName}{Role: "assistant", Content: Some[ChatAssistantContent](ChatText(content))}`,
          '}'
        ].join('\n')
      );
    } else if (role === 'tool') {
      state.definitions.push(
        [
          `// ToolMessage constructs a tool result chat message.`,
          `func ToolMessage(toolCallID string, content string) ${structName} {`,
          `\treturn ${structName}{Role: "tool", ToolCallID: toolCallID, Content: ChatText(content)}`,
          '}'
        ].join('\n')
      );
    } else if (role === 'function') {
      state.definitions.push(
        [
          `// FunctionMessage constructs a legacy function result chat message.`,
          `func FunctionMessage(name string, content string) ${structName} {`,
          `\treturn ${structName}{Role: "function", Name: name, Content: String(content)}`,
          '}'
        ].join('\n')
      );
    }
  }

  return ifaceName;
};

const emitChatSimpleContent = ({
  schema,
  state
}: {
  schema: IrSchema;
  state: ModelEmitState;
}): string => {
  const ifaceName = 'ChatSimpleContent';
  if (state.chatPartTypeCache.has(ifaceName)) {
    return state.chatPartTypeCache.get(ifaceName)!;
  }
  state.usedTypeNames.add(ifaceName);
  state.usedTypeNames.add('ChatSimpleContentParts');
  state.chatPartTypeCache.set(ifaceName, ifaceName);

  const arr = schema.kind === 'union' ? schema.variants.find((v) => v.kind === 'array') : undefined;
  const partStruct =
    arr !== undefined && arr.kind === 'array' && arr.items.kind === 'object'
      ? ensureSharedChatTextPart({ schema: arr.items, state })
      : 'ChatTextPart';

  ensureChatTextType(state);

  state.definitions.push(
    [
      '// ChatSimpleContent represents text or text-part list content on system/developer messages.',
      `type ${ifaceName} interface {`,
      `\tis${ifaceName}()`,
      '}',
      '',
      `func (ChatContentText) is${ifaceName}() {}`,
      '',
      `// ChatSimpleContentParts wraps a slice of text parts as ${ifaceName}.`,
      `type ChatSimpleContentParts []${partStruct}`,
      '',
      `func (ChatSimpleContentParts) is${ifaceName}() {}`
    ].join('\n')
  );
  return ifaceName;
};

const emitChatUserContent = ({
  schema,
  state
}: {
  schema: IrSchema;
  state: ModelEmitState;
}): string => {
  const ifaceName = 'ChatUserContent';
  if (state.chatPartTypeCache.has(ifaceName)) {
    return state.chatPartTypeCache.get(ifaceName)!;
  }
  state.usedTypeNames.add(ifaceName);
  state.usedTypeNames.add('ChatUserContentParts');
  state.usedTypeNames.add('ChatUserContentPart');
  state.chatPartTypeCache.set(ifaceName, ifaceName);

  ensureChatTextType(state);

  state.definitions.push(
    [
      '// ChatUserContent represents string or multimodal part list content on a user message.',
      `type ${ifaceName} interface {`,
      `\tis${ifaceName}()`,
      '}',
      '',
      `func (ChatContentText) is${ifaceName}() {}`,
      '',
      '// ChatUserContentPart represents one multimodal part inside a user message.',
      'type ChatUserContentPart interface {',
      '\tisChatUserContentPart()',
      '}',
      '',
      '// ChatUserContentParts wraps a slice of ChatUserContentPart as ChatUserContent.',
      'type ChatUserContentParts []ChatUserContentPart',
      '',
      `func (ChatUserContentParts) is${ifaceName}() {}`
    ].join('\n')
  );

  const arr = schema.kind === 'union' ? schema.variants.find((v) => v.kind === 'array') : undefined;
  const partUnion =
    arr !== undefined && arr.kind === 'array' && arr.items.kind === 'union' ? arr.items : undefined;

  if (partUnion !== undefined) {
    for (const partVariant of partUnion.variants) {
      if (partVariant.kind !== 'object') continue;
      const typeProp = partVariant.properties.find(
        (p) => p.name === 'type' && p.schema.kind === 'literal'
      );
      const litVal =
        typeProp !== undefined && typeProp.schema.kind === 'literal'
          ? String(typeProp.schema.value)
          : 'part';

      if (litVal === 'text') {
        const name = ensureSharedChatTextPart({ schema: partVariant, state });
        state.definitions.push(`func (${name}) isChatUserContentPart() {}`);
        continue;
      }
      if (litVal === 'image_url') {
        const name = ensureSharedChatImagePart({ schema: partVariant, state });
        state.definitions.push(`func (${name}) isChatUserContentPart() {}`);
        continue;
      }

      const partStructName = reserveUniqueTypeName({
        preferredName: `ChatUser${toGoPascalCase(litVal)}Part`,
        usedTypeNames: state.usedTypeNames
      });
      emitObjectStruct({
        structName: partStructName,
        properties: partVariant.properties,
        docLines: [`${partStructName} represents a "${litVal}" user message part.`],
        state,
        forcedLiterals: [{ fieldName: 'Type', valueExpr: toGoStringLiteral(litVal) }]
      });
      state.definitions.push(`func (${partStructName}) isChatUserContentPart() {}`);

      if (litVal === 'select') {
        state.definitions.push(
          [
            '// UserSelectPart constructs a structured interactive select user part.',
            `func UserSelectPart(sel ChatSelectPayload) ${partStructName} {`,
            `\treturn ${partStructName}{Type: "select", Select: sel}`,
            '}'
          ].join('\n')
        );
      } else if (litVal === 'input_audio') {
        state.definitions.push(
          [
            '// UserAudioPart constructs an audio input user part (base64 data).',
            `func UserAudioPart(data string) ${partStructName} {`,
            `\treturn ${partStructName}{Type: "input_audio", InputAudio: ${partStructName}InputAudio{Data: data}}`,
            '}'
          ].join('\n')
        );
      } else if (litVal === 'video_url') {
        state.definitions.push(
          [
            '// UserVideoPart constructs a video URL user part.',
            `func UserVideoPart(url string) ${partStructName} {`,
            `\treturn ${partStructName}{Type: "video_url", VideoURL: ${partStructName}VideoURL{URL: url}}`,
            '}'
          ].join('\n')
        );
      } else if (litVal === 'file') {
        state.definitions.push(
          [
            '// UserFilePart constructs an inline file user part.',
            `func UserFilePart(file ${partStructName}File) ${partStructName} {`,
            `\treturn ${partStructName}{Type: "file", File: file}`,
            '}'
          ].join('\n')
        );
      } else if (litVal === 'file_url') {
        state.definitions.push(
          [
            '// UserFileURLPart constructs a file URL user part.',
            `func UserFileURLPart(url string) ${partStructName} {`,
            `\treturn ${partStructName}{Type: "file_url", URL: url}`,
            '}'
          ].join('\n')
        );
      }
    }
  }

  return ifaceName;
};

const emitChatAssistantContent = ({
  schema,
  state
}: {
  schema: IrSchema;
  state: ModelEmitState;
}): string => {
  const ifaceName = 'ChatAssistantContent';
  if (state.chatPartTypeCache.has(ifaceName)) {
    return state.chatPartTypeCache.get(ifaceName)!;
  }
  state.usedTypeNames.add(ifaceName);
  state.usedTypeNames.add('ChatAssistantContentParts');
  state.usedTypeNames.add('ChatAssistantContentPart');
  state.chatPartTypeCache.set(ifaceName, ifaceName);

  ensureChatTextType(state);

  state.definitions.push(
    [
      '// ChatAssistantContent represents string or part list content on an assistant message.',
      `type ${ifaceName} interface {`,
      `\tis${ifaceName}()`,
      '}',
      '',
      `func (ChatContentText) is${ifaceName}() {}`,
      '',
      '// ChatAssistantContentPart represents one content part inside an assistant message.',
      'type ChatAssistantContentPart interface {',
      '\tisChatAssistantContentPart()',
      '}',
      '',
      '// ChatAssistantContentParts wraps a slice of ChatAssistantContentPart as ChatAssistantContent.',
      'type ChatAssistantContentParts []ChatAssistantContentPart',
      '',
      `func (ChatAssistantContentParts) is${ifaceName}() {}`
    ].join('\n')
  );

  const nonNullVariants =
    schema.kind === 'union' ? splitNullableUnion(schema.variants).nonNullVariants : [];
  const arr = nonNullVariants.find((v) => v.kind === 'array');
  const partUnion =
    arr !== undefined && arr.kind === 'array' && arr.items.kind === 'union' ? arr.items : undefined;

  if (partUnion !== undefined) {
    for (const partVariant of partUnion.variants) {
      if (partVariant.kind !== 'object') continue;
      const typeProp = partVariant.properties.find(
        (p) => p.name === 'type' && p.schema.kind === 'literal'
      );
      const litVal =
        typeProp !== undefined && typeProp.schema.kind === 'literal'
          ? String(typeProp.schema.value)
          : 'part';

      if (litVal === 'text') {
        const name = ensureSharedChatTextPart({ schema: partVariant, state });
        state.definitions.push(`func (${name}) isChatAssistantContentPart() {}`);
        continue;
      }

      const partStructName = reserveUniqueTypeName({
        preferredName: `ChatAssistant${toGoPascalCase(litVal)}Part`,
        usedTypeNames: state.usedTypeNames
      });
      emitObjectStruct({
        structName: partStructName,
        properties: partVariant.properties,
        docLines: [`${partStructName} represents a "${litVal}" assistant message part.`],
        state,
        forcedLiterals: [{ fieldName: 'Type', valueExpr: toGoStringLiteral(litVal) }]
      });
      state.definitions.push(`func (${partStructName}) isChatAssistantContentPart() {}`);
      if (litVal === 'refusal') {
        state.definitions.push(
          [
            '// RefusalPart constructs an assistant refusal part.',
            `func RefusalPart(refusal string) ${partStructName} {`,
            `\treturn ${partStructName}{Type: "refusal", Refusal: refusal}`,
            '}'
          ].join('\n')
        );
      }
    }
  }

  return ifaceName;
};

const emitChatToolContent = ({
  schema,
  state
}: {
  schema: IrSchema;
  state: ModelEmitState;
}): string => {
  const ifaceName = 'ChatToolContent';
  if (state.chatPartTypeCache.has(ifaceName)) {
    return state.chatPartTypeCache.get(ifaceName)!;
  }
  state.usedTypeNames.add(ifaceName);
  state.usedTypeNames.add('ChatToolContentParts');
  state.usedTypeNames.add('ChatToolContentPart');
  state.chatPartTypeCache.set(ifaceName, ifaceName);

  ensureChatTextType(state);

  state.definitions.push(
    [
      '// ChatToolContent represents string or part list content on a tool message.',
      `type ${ifaceName} interface {`,
      `\tis${ifaceName}()`,
      '}',
      '',
      `func (ChatContentText) is${ifaceName}() {}`,
      '',
      '// ChatToolContentPart represents one content part inside a tool message.',
      'type ChatToolContentPart interface {',
      '\tisChatToolContentPart()',
      '}',
      '',
      '// ChatToolContentParts wraps a slice of ChatToolContentPart as ChatToolContent.',
      'type ChatToolContentParts []ChatToolContentPart',
      '',
      `func (ChatToolContentParts) is${ifaceName}() {}`
    ].join('\n')
  );

  const arr = schema.kind === 'union' ? schema.variants.find((v) => v.kind === 'array') : undefined;
  const partUnion =
    arr !== undefined && arr.kind === 'array' && arr.items.kind === 'union' ? arr.items : undefined;

  if (partUnion !== undefined) {
    for (const partVariant of partUnion.variants) {
      if (partVariant.kind !== 'object') continue;
      const typeProp = partVariant.properties.find(
        (p) => p.name === 'type' && p.schema.kind === 'literal'
      );
      const litVal =
        typeProp !== undefined && typeProp.schema.kind === 'literal'
          ? String(typeProp.schema.value)
          : 'part';

      if (litVal === 'text') {
        const name = ensureSharedChatTextPart({ schema: partVariant, state });
        state.definitions.push(`func (${name}) isChatToolContentPart() {}`);
        continue;
      }
      if (litVal === 'image_url') {
        const name = ensureSharedChatImagePart({ schema: partVariant, state });
        state.definitions.push(`func (${name}) isChatToolContentPart() {}`);
      }
    }
  }

  return ifaceName;
};

const emitChatSelectInputUnion = ({
  schema,
  state
}: {
  schema: Extract<IrSchema, { kind: 'union' }>;
  state: ModelEmitState;
}): string => {
  const ifaceName = 'ChatSelectPayload';
  if (state.chatPartTypeCache.has(ifaceName)) {
    return state.chatPartTypeCache.get(ifaceName)!;
  }
  state.usedTypeNames.add(ifaceName);
  state.chatPartTypeCache.set(ifaceName, ifaceName);

  const marker = `is${ifaceName}()`;
  state.definitions.push(
    [
      '// ChatSelectPayload represents a structured select response payload in a user message.',
      `type ${ifaceName} interface {`,
      `\t${marker}`,
      '}'
    ].join('\n')
  );

  for (const variant of schema.variants) {
    if (variant.kind !== 'object') continue;
    const typeProp = variant.properties.find(
      (p) => p.name === 'type' && p.schema.kind === 'literal'
    );
    const actionProp = variant.properties.find(
      (p) => p.name === 'action' && p.schema.kind === 'literal'
    );
    const typeVal =
      typeProp !== undefined && typeProp.schema.kind === 'literal'
        ? String(typeProp.schema.value)
        : 'variant';
    const actionVal =
      actionProp !== undefined && actionProp.schema.kind === 'literal'
        ? String(actionProp.schema.value)
        : undefined;

    const suffix =
      actionVal !== undefined
        ? `${toGoPascalCase(typeVal)}${toGoPascalCase(actionVal)}`
        : toGoPascalCase(typeVal);
    const structName = reserveUniqueTypeName({
      preferredName: `ChatSelect${suffix}`,
      usedTypeNames: state.usedTypeNames
    });

    const forcedLiterals = [
      { fieldName: 'Type', valueExpr: toGoStringLiteral(typeVal) },
      ...(actionVal !== undefined
        ? [{ fieldName: 'Action', valueExpr: toGoStringLiteral(actionVal) }]
        : [])
    ];

    emitObjectStruct({
      structName,
      properties: variant.properties,
      docLines: [
        `${structName} represents the "${typeVal}"${actionVal !== undefined ? ` (${actionVal})` : ''} select payload.`
      ],
      state,
      forcedLiterals
    });
    state.definitions.push(formatMarkerMethod({ receiver: structName, method: marker }));
  }

  return ifaceName;
};

/** 发射通用输入侧密封联合接口（支持标量、数组与对象变体）。 */
const emitInputUnion = ({
  schema,
  hintName,
  concept,
  state
}: {
  schema: Extract<IrSchema, { kind: 'union' }>;
  hintName: string;
  concept: string;
  state: ModelEmitState;
}): string => {
  if (isAuthProxyBodyUnion(schema)) {
    return 'AuthProxy';
  }
  if (isAuthProxyQueryUnion(schema)) {
    return ensureAuthProxyInput(state);
  }
  if (isDatasetTagUnion(schema)) {
    return ensureDatasetTagInput(state);
  }
  if (isChatMessagesUnion(schema)) {
    return emitChatCompletionsMessages({ schema, state });
  }
  if (isChatSimpleContentUnion(schema)) {
    return emitChatSimpleContent({ schema, state });
  }
  if (isChatSelectUnion(schema)) {
    return emitChatSelectInputUnion({ schema, state });
  }
  if (isDatasetsSearchTagFilterUnion(schema)) {
    return emitDatasetsSearchTagFilterUnion({ schema, state });
  }

  const dedupeKey = getConceptDedupeKey({
    direction: 'input',
    concept,
    schema
  });
  if (state.dedupeMap.has(dedupeKey)) {
    return state.dedupeMap.get(dedupeKey)!;
  }

  const ifaceName = reserveUniqueTypeName({
    preferredName: hintName,
    usedTypeNames: state.usedTypeNames
  });
  state.dedupeMap.set(dedupeKey, ifaceName);

  const marker = `is${ifaceName}()`;
  const doc = formatGoDocComment({ lines: [schema.description] });
  state.definitions.push(`${doc}type ${ifaceName} interface {\n\t${marker}\n}`);

  schema.variants.forEach((variant, idx) => {
    emitInputUnionVariant({
      ifaceName,
      marker,
      variant,
      variantIndex: idx,
      state
    });
  });

  return ifaceName;
};

const deriveInputObjectVariantSuffix = ({
  variant,
  variantIndex
}: {
  variant: IrRequestObjectSchema;
  variantIndex: number;
}): string => {
  const enabledProp = variant.properties.find(
    (p) =>
      p.name === 'enabled' && p.schema.kind === 'literal' && typeof p.schema.value === 'boolean'
  );
  if (enabledProp !== undefined && enabledProp.schema.kind === 'literal') {
    return enabledProp.schema.value ? 'Enabled' : 'Disabled';
  }

  const opProp = variant.properties.find((p) => p.name === 'op' && p.schema.kind === 'enum');
  if (opProp !== undefined && opProp.schema.kind === 'enum') {
    const first = String(opProp.schema.values[0] ?? '');
    if (first === '$empty') return 'Empty';
    if (first === '$eq') return 'Compare';
    if (first === '$contains') return 'Contains';
    if (first === '$startsWith') return 'Pattern';
    if (first === '$is') return 'Set';
  }

  const litProps = variant.properties.filter(
    (p) => p.schema.kind === 'literal' && p.schema.value !== undefined
  );
  if (litProps.length === 1) {
    const lp = litProps[0]!;
    if (lp.schema.kind === 'literal') {
      return toGoPascalCase(String(lp.schema.value));
    }
  }

  const requiredKeys = variant.properties
    .filter((p) => p.required && p.schema.kind !== 'never')
    .map((p) => p.name);
  if (requiredKeys.length === 1) {
    return `By${toGoPascalCase(requiredKeys[0]!)}`;
  }
  if (requiredKeys.length > 1 && requiredKeys.length <= 2) {
    return `By${requiredKeys.map(toGoPascalCase).join('And')}`;
  }

  const nonNeverProps = variant.properties.filter((p) => p.schema.kind !== 'never');
  if (nonNeverProps.some((p) => p.name === 'topk')) {
    return 'ByTopK';
  }

  return `Variant${variantIndex + 1}`;
};

const emitInputUnionVariant = ({
  ifaceName,
  marker,
  variant,
  variantIndex,
  state
}: {
  ifaceName: string;
  marker: string;
  variant: IrSchema;
  variantIndex: number;
  state: ModelEmitState;
}): void => {
  if (variant.kind === 'object') {
    const suffix = deriveInputObjectVariantSuffix({ variant, variantIndex });
    const structName = reserveUniqueTypeName({
      preferredName: `${ifaceName}${suffix}`,
      usedTypeNames: state.usedTypeNames
    });

    const forcedLiterals = variant.properties
      .filter((p) => p.required && p.schema.kind === 'literal')
      .map((p) => ({
        fieldName: toGoFieldName({ rawName: p.name, usedNames: new Set() }),
        valueExpr: renderLiteralGoExpr((p.schema as Extract<IrSchema, { kind: 'literal' }>).value)
      }));

    emitObjectStruct({
      structName,
      properties: variant.properties,
      docLines: [variant.description],
      state,
      forcedLiterals
    });
    state.definitions.push(formatMarkerMethod({ receiver: structName, method: marker }));

    emitInputVariantHelper({ ifaceName, structName, variant, state });
    return;
  }

  const underlyingType = renderSchemaToGoType({
    schema: variant,
    hintName: `${ifaceName}Variant${variantIndex + 1}`,
    concept: `${ifaceName}Variant${variantIndex + 1}`,
    state
  });

  const typeSuffix = (() => {
    if (variant.kind === 'primitive') return toGoPascalCase(variant.type);
    if (variant.kind === 'enum') return 'Single';
    if (variant.kind === 'array') return 'List';
    return `Variant${variantIndex + 1}`;
  })();

  const wrapperName = reserveUniqueTypeName({
    preferredName: `${ifaceName}${typeSuffix}`,
    usedTypeNames: state.usedTypeNames
  });

  state.definitions.push(
    [
      `// ${wrapperName} wraps ${underlyingType} as ${ifaceName}.`,
      `type ${wrapperName} ${underlyingType}`,
      '',
      formatMarkerMethod({ receiver: wrapperName, method: marker })
    ].join('\n')
  );

  // 为常见请求联合标量/切片提供简洁构造函数
  emitInputScalarConstructor({ ifaceName, wrapperName, variant, underlyingType, state });
};

const emitDatasetsSearchTagFilterUnion = ({
  schema,
  state
}: {
  schema: Extract<IrSchema, { kind: 'union' }>;
  state: ModelEmitState;
}): string => {
  const ifaceName = 'DatasetsSearchTagFilter';
  if (state.chatPartTypeCache.has(ifaceName)) {
    return state.chatPartTypeCache.get(ifaceName)!;
  }
  state.usedTypeNames.add(ifaceName);
  state.usedTypeNames.add('DatasetsSearchTagScalarValue');
  state.usedTypeNames.add('DatasetsSearchTagTextOrListValue');
  state.usedTypeNames.add('DatasetsSearchTagStringValue');
  state.usedTypeNames.add('DatasetsSearchTagNumberValue');
  state.usedTypeNames.add('DatasetsSearchTagStringsValue');
  state.usedTypeNames.add('SearchTagString');
  state.usedTypeNames.add('SearchTagNumber');
  state.usedTypeNames.add('SearchTagStrings');
  state.chatPartTypeCache.set(ifaceName, ifaceName);

  const marker = `is${ifaceName}()`;
  state.definitions.push(
    [
      '// DatasetsSearchTagFilter represents one tag filter condition in dataset search.',
      `type ${ifaceName} interface {`,
      `\t${marker}`,
      '}',
      '',
      '// DatasetsSearchTagScalarValue represents a string or numeric value for comparison tag filters.',
      'type DatasetsSearchTagScalarValue interface {',
      '\tisDatasetsSearchTagScalarValue()',
      '}',
      '',
      '// DatasetsSearchTagTextOrListValue represents a string or []string value for contains tag filters.',
      'type DatasetsSearchTagTextOrListValue interface {',
      '\tisDatasetsSearchTagTextOrListValue()',
      '}',
      '',
      '// DatasetsSearchTagStringValue wraps a string search tag filter value.',
      'type DatasetsSearchTagStringValue string',
      '',
      'func (DatasetsSearchTagStringValue) isDatasetsSearchTagScalarValue()     {}',
      'func (DatasetsSearchTagStringValue) isDatasetsSearchTagTextOrListValue() {}',
      '',
      '// DatasetsSearchTagNumberValue wraps a numeric search tag filter value.',
      'type DatasetsSearchTagNumberValue float64',
      '',
      'func (DatasetsSearchTagNumberValue) isDatasetsSearchTagScalarValue() {}',
      '',
      '// DatasetsSearchTagStringsValue wraps a string-slice search tag filter value.',
      'type DatasetsSearchTagStringsValue []string',
      '',
      'func (DatasetsSearchTagStringsValue) isDatasetsSearchTagTextOrListValue() {}',
      '',
      '// SearchTagString constructs a string search tag filter value.',
      'func SearchTagString(val string) DatasetsSearchTagStringValue {',
      '\treturn DatasetsSearchTagStringValue(val)',
      '}',
      '',
      '// SearchTagNumber constructs a numeric search tag filter value.',
      'func SearchTagNumber(val float64) DatasetsSearchTagNumberValue {',
      '\treturn DatasetsSearchTagNumberValue(val)',
      '}',
      '',
      '// SearchTagStrings constructs a string-slice search tag filter value.',
      'func SearchTagStrings(vals ...string) DatasetsSearchTagStringsValue {',
      '\treturn DatasetsSearchTagStringsValue(vals)',
      '}'
    ].join('\n')
  );

  for (const variant of schema.variants) {
    if (variant.kind !== 'object') continue;
    const suffix = deriveInputObjectVariantSuffix({ variant, variantIndex: 0 });
    const structName = reserveUniqueTypeName({
      preferredName: `DatasetsSearchTag${suffix}Filter`,
      usedTypeNames: state.usedTypeNames
    });

    if (suffix === 'Compare' || suffix === 'Contains') {
      const valueTypeName =
        suffix === 'Compare' ? 'DatasetsSearchTagScalarValue' : 'DatasetsSearchTagTextOrListValue';
      const tagProp = variant.properties.find((p) => p.name === 'tag')!;
      const opProp = variant.properties.find((p) => p.name === 'op')!;
      const entries: StructFieldEntry[] = [];
      for (const p of [tagProp, opProp]) {
        const pDoc = formatGoDocComment({
          lines: [p.description, formatAllowedValuesNote(p.schema)],
          indent: '\t'
        });
        for (const commentLine of pDoc.trimEnd().split('\n')) {
          if (commentLine.length > 0) entries.push({ kind: 'comment', text: commentLine });
        }
        entries.push({
          kind: 'field',
          name: toGoPascalCase(p.name),
          typeExpr: 'string',
          tag: `\`json:"${p.name}"\``
        });
      }
      entries.push({
        kind: 'field',
        name: 'Value',
        typeExpr: valueTypeName,
        tag: '`json:"value"`'
      });
      state.definitions.push(
        renderAlignedStruct({
          structName,
          doc: formatGoDocComment({ lines: [variant.description] }),
          entries
        })
      );
      state.definitions.push(formatMarkerMethod({ receiver: structName, method: marker }));

      if (suffix === 'Compare') {
        state.definitions.push(
          [
            '// SearchTagCompare constructs a comparison dataset tag filter ($eq, $ne, $gt, $lt, $gte, $lte).',
            `func SearchTagCompare(tag, op string, value ${valueTypeName}) ${structName} {`,
            `\treturn ${structName}{Tag: tag, Op: op, Value: value}`,
            '}'
          ].join('\n')
        );
      } else {
        state.definitions.push(
          [
            '// SearchTagContains constructs a $contains / $notContains dataset tag filter.',
            `func SearchTagContains(tag, op string, value ${valueTypeName}) ${structName} {`,
            `\treturn ${structName}{Tag: tag, Op: op, Value: value}`,
            '}'
          ].join('\n')
        );
      }
      continue;
    }

    emitObjectStruct({
      structName,
      properties: variant.properties,
      docLines: [variant.description],
      state
    });
    state.definitions.push(formatMarkerMethod({ receiver: structName, method: marker }));

    if (suffix === 'Empty') {
      state.definitions.push(
        [
          '// SearchTagEmpty constructs an $empty / $notEmpty dataset tag filter.',
          `func SearchTagEmpty(tag, op string) ${structName} {`,
          `\treturn ${structName}{Tag: tag, Op: op}`,
          '}'
        ].join('\n')
      );
    } else if (suffix === 'Pattern') {
      state.definitions.push(
        [
          '// SearchTagPattern constructs a pattern dataset tag filter ($startsWith, $endsWith, $regex).',
          `func SearchTagPattern(tag, op, value string) ${structName} {`,
          `\treturn ${structName}{Tag: tag, Op: op, Value: value}`,
          '}'
        ].join('\n')
      );
    } else if (suffix === 'Set') {
      state.definitions.push(
        [
          '// SearchTagSet constructs a set dataset tag filter ($is, $isNot, $in, $notIn).',
          `func SearchTagSet(tag, op string, values ...string) ${structName} {`,
          `\treturn ${structName}{Tag: tag, Op: op, Value: values}`,
          '}'
        ].join('\n')
      );
    }
  }

  return ifaceName;
};

const emitInputVariantHelper = ({
  ifaceName,
  structName,
  variant,
  state
}: {
  ifaceName: string;
  structName: string;
  variant: IrRequestObjectSchema;
  state: ModelEmitState;
}): void => {
  const nonNeverRequired = variant.properties.filter(
    (p) => p.required && p.schema.kind !== 'never'
  );

  // 针对 DatasetsSearchParams 等具名常用请求联合提供直观构造器
  if (ifaceName === 'DatasetsSearchParamsQuery') {
    if (structName.endsWith('ByText')) {
      state.definitions.push(
        [
          '// SearchQueryByText constructs a text-based dataset search query.',
          `func SearchQueryByText(text string) ${structName} {`,
          `\treturn ${structName}{Text: text}`,
          '}'
        ].join('\n')
      );
    } else {
      state.definitions.push(
        [
          '// SearchQueryByImages constructs an image-key dataset search query.',
          `func SearchQueryByImages(imageKeys ...string) ${structName} {`,
          `\treturn ${structName}{ImageKeys: imageKeys}`,
          '}'
        ].join('\n')
      );
    }
    return;
  }

  if (ifaceName === 'DatasetsSearchParamsRerank') {
    if (structName.endsWith('Disabled')) {
      state.definitions.push(
        [
          '// SearchRerankDisabled disables reranking for dataset search.',
          `func SearchRerankDisabled() ${structName} {`,
          `\treturn ${structName}{Enabled: false}`,
          '}'
        ].join('\n')
      );
    } else {
      state.definitions.push(
        [
          '// SearchRerankEnabled enables reranking for dataset search.',
          `func SearchRerankEnabled() ${structName} {`,
          `\treturn ${structName}{Enabled: true}`,
          '}'
        ].join('\n')
      );
    }
    return;
  }

  if (ifaceName === 'DatasetsSearchParamsQueryExtension') {
    if (structName.endsWith('Disabled')) {
      state.definitions.push(
        [
          '// SearchQueryExtensionDisabled disables query extension for dataset search.',
          `func SearchQueryExtensionDisabled() ${structName} {`,
          `\treturn ${structName}{Enabled: false}`,
          '}'
        ].join('\n')
      );
    } else {
      state.definitions.push(
        [
          '// SearchQueryExtensionEnabled enables query extension for dataset search.',
          `func SearchQueryExtensionEnabled() ${structName} {`,
          `\treturn ${structName}{Enabled: true}`,
          '}'
        ].join('\n')
      );
    }
    return;
  }

  if (ifaceName === 'DatasetsSearchParamsResult') {
    if (structName.endsWith('ByMaxTokens')) {
      state.definitions.push(
        [
          '// SearchResultByMaxTokens configures token-budgeted search results.',
          `func SearchResultByMaxTokens(maxTokens int) ${structName} {`,
          `\treturn ${structName}{MaxTokens: maxTokens}`,
          '}'
        ].join('\n')
      );
    } else {
      const topkProp = variant.properties.find((p) => p.name === 'topk');
      const topkExpr = topkProp?.required ? 'topk' : 'Int(topk)';
      state.definitions.push(
        [
          '// SearchResultByTopK configures top-K search results.',
          `func SearchResultByTopK(topk int) ${structName} {`,
          `\treturn ${structName}{Topk: ${topkExpr}}`,
          '}'
        ].join('\n')
      );
    }
    return;
  }

  void nonNeverRequired;
};

const emitInputScalarConstructor = ({
  ifaceName,
  wrapperName,
  variant,
  underlyingType,
  state
}: {
  ifaceName: string;
  wrapperName: string;
  variant: IrSchema;
  underlyingType: string;
  state: ModelEmitState;
}): void => {
  if (ifaceName === 'DatasetsCollectionsListParamsTagFiltersItemValuesItem') {
    const fnName =
      variant.kind === 'primitive' && variant.type === 'number'
        ? 'TagFilterNumber'
        : 'TagFilterString';
    state.definitions.push(
      [
        `// ${fnName} constructs a tag filter value.`,
        `func ${fnName}(val ${underlyingType}) ${wrapperName} {`,
        `\treturn ${wrapperName}(val)`,
        '}'
      ].join('\n')
    );
    return;
  }

  if (ifaceName === 'DatasetsListParamsType') {
    if (variant.kind === 'enum') {
      state.definitions.push(
        [
          '// DatasetType filters datasets by a single dataset type.',
          `func DatasetType(datasetType string) ${wrapperName} {`,
          `\treturn ${wrapperName}(datasetType)`,
          '}'
        ].join('\n')
      );
    } else if (variant.kind === 'array') {
      state.definitions.push(
        [
          '// DatasetTypes filters datasets by one or more dataset types.',
          `func DatasetTypes(datasetTypes ...string) ${wrapperName} {`,
          `\treturn ${wrapperName}(datasetTypes)`,
          '}'
        ].join('\n')
      );
    }
    return;
  }

  // Fallback helper constructor when preferred name is free
  const paramName = toGoParamName(variant.kind === 'array' ? 'values' : 'value');
  const helperName = `New${wrapperName}`;
  if (!state.usedTypeNames.has(helperName)) {
    state.usedTypeNames.add(helperName);
    state.definitions.push(
      [
        `// ${helperName} constructs a ${wrapperName} value for ${ifaceName}.`,
        `func ${helperName}(${paramName} ${underlyingType}) ${wrapperName} {`,
        `\treturn ${wrapperName}(${paramName})`,
        '}'
      ].join('\n')
    );
  }
};

type VariantDiscrimination = {
  suffix: string;
  checkExpr: (rawVarName: string, liftedFields: Set<string>) => string;
};

const describeVariantsForOutputUnion = ({
  variants
}: {
  variants: Array<Extract<IrSchema, { kind: 'object' }>>;
}): VariantDiscrimination[] => {
  // 1. 尝试寻找单一必选字面量鉴别字段（如 type="llm" 或 obj="AI"）
  const commonKeys = variants[0]!.properties
    .map((p) => p.name)
    .filter((name) => variants.every((v) => v.properties.some((p) => p.name === name)));

  for (const key of commonKeys) {
    const literals = variants.map((v) => {
      const prop = v.properties.find((p) => p.name === key);
      return prop?.schema.kind === 'literal' ? prop.schema.value : undefined;
    });
    if (literals.every((val) => val !== undefined)) {
      const unique = new Set(literals.map((val) => String(val)));
      if (unique.size === variants.length) {
        const goField = toGoFieldName({ rawName: key, usedNames: new Set() });
        return literals.map((val) => ({
          suffix: toGoPascalCase(String(val)),
          checkExpr: (rawVarName, liftedFields) =>
            liftedFields.has(key)
              ? `u.${goField} == ${renderLiteralGoExpr(val!)}`
              : `rawJSONStringEquals(${rawVarName}, ${toGoStringLiteral(key)}, ${toGoStringLiteral(String(val))})`
        }));
      }
    }
  }

  // 2. 尝试复合字面量键（如 select: type + action）
  const hasTypeAndAction = variants.every((v) =>
    v.properties.some((p) => p.name === 'type' && p.schema.kind === 'literal')
  );
  if (hasTypeAndAction) {
    const suffixes: string[] = [];
    const checks: Array<(rawVarName: string, liftedFields: Set<string>) => string> = [];
    for (const v of variants) {
      const typeProp = v.properties.find((p) => p.name === 'type')!;
      const typeVal = (typeProp.schema as Extract<IrSchema, { kind: 'literal' }>).value;
      const actionProp = v.properties.find(
        (p) => p.name === 'action' && p.schema.kind === 'literal'
      );
      if (actionProp !== undefined && actionProp.schema.kind === 'literal') {
        const actionVal = actionProp.schema.value;
        suffixes.push(`${toGoPascalCase(String(typeVal))}${toGoPascalCase(String(actionVal))}`);
        checks.push(
          (rawVarName) =>
            `rawJSONStringEquals(${rawVarName}, "type", ${toGoStringLiteral(String(typeVal))}) && rawJSONStringEquals(${rawVarName}, "action", ${toGoStringLiteral(String(actionVal))})`
        );
      } else {
        suffixes.push(toGoPascalCase(String(typeVal)));
        checks.push(
          (rawVarName) =>
            `rawJSONStringEquals(${rawVarName}, "type", ${toGoStringLiteral(String(typeVal))})`
        );
      }
    }
    if (new Set(suffixes).size === variants.length) {
      return suffixes.map((suffix, idx) => ({ suffix, checkExpr: checks[idx]! }));
    }
  }

  // 3. ModelsSummaryRes 风格：status: "deleted" vs status: enum["active", "disabled", "forbidden"]
  if (variants.length === 2) {
    const status0 = variants[0]!.properties.find((p) => p.name === 'status');
    const status1 = variants[1]!.properties.find((p) => p.name === 'status');
    if (status0?.schema.kind === 'literal' && status1?.schema.kind === 'enum') {
      const litVal = String(status0.schema.value);
      const enumVals = status1.schema.values.map(String);
      return [
        {
          suffix: toGoPascalCase(litVal),
          checkExpr: (_raw, liftedFields) =>
            liftedFields.has('status')
              ? `u.Status == ${toGoStringLiteral(litVal)}`
              : `rawJSONStringEquals(fields, "status", ${toGoStringLiteral(litVal)})`
        },
        {
          suffix: 'Active',
          checkExpr: (_raw, liftedFields) => {
            const conds = enumVals.map((ev) =>
              liftedFields.has('status')
                ? `u.Status == ${toGoStringLiteral(ev)}`
                : `rawJSONStringEquals(fields, "status", ${toGoStringLiteral(ev)})`
            );
            return conds.join(' || ');
          }
        }
      ];
    }
  }

  // 4. ChatInitRes / ChatHistoriesListResListItem 风格：sourceType 字面量 + appId vs skillId
  const hasSourceTypeBranches = variants.some((v) =>
    v.properties.some((p) => p.name === 'sourceType' && p.schema.kind === 'literal')
  );
  if (hasSourceTypeBranches) {
    return variants.map((v, idx) => {
      const st = v.properties.find((p) => p.name === 'sourceType' && p.schema.kind === 'literal');
      if (st !== undefined && st.schema.kind === 'literal') {
        const val = String(st.schema.value);
        return {
          suffix: toGoPascalCase(val),
          checkExpr: (rawVarName) =>
            `rawJSONStringEquals(${rawVarName}, "sourceType", ${toGoStringLiteral(val)})`
        };
      }
      if (v.properties.some((p) => p.name === 'appId')) {
        return {
          suffix: 'App',
          checkExpr: (rawVarName) =>
            `rawJSONHasKey(${rawVarName}, "appId") && !rawJSONHasKey(${rawVarName}, "sourceType")`
        };
      }
      if (v.properties.some((p) => p.name === 'skillId')) {
        return {
          suffix: 'Skill',
          checkExpr: (rawVarName) =>
            `rawJSONHasKey(${rawVarName}, "skillId") && !rawJSONHasKey(${rawVarName}, "appId")`
        };
      }
      return {
        suffix: `Variant${idx + 1}`,
        checkExpr: () => 'true'
      };
    });
  }

  // 5. QuoteItem 风格：完整引用含 q 字段 vs 精简引用不含 q 字段
  if (
    variants.length === 2 &&
    variants[0]!.properties.some((p) => p.name === 'q' && p.required) &&
    !variants[1]!.properties.some((p) => p.name === 'q')
  ) {
    return [
      {
        suffix: 'Full',
        checkExpr: (rawVarName) => `rawJSONHasKey(${rawVarName}, "q")`
      },
      {
        suffix: 'Brief',
        checkExpr: (rawVarName) => `!rawJSONHasKey(${rawVarName}, "q")`
      }
    ];
  }

  // 6. PluginInputValue 风格：{value: string} | {secret: string} | {ref: ...} | {value: number|bool}
  if (
    variants.length === 4 &&
    variants.some((v) => v.properties.some((p) => p.name === 'secret')) &&
    variants.some((v) => v.properties.some((p) => p.name === 'ref'))
  ) {
    return variants.map((v, idx) => {
      if (v.properties.some((p) => p.name === 'secret')) {
        return {
          suffix: 'Secret',
          checkExpr: (rawVarName) => `rawJSONHasKey(${rawVarName}, "secret")`
        };
      }
      if (v.properties.some((p) => p.name === 'ref')) {
        return {
          suffix: 'Ref',
          checkExpr: (rawVarName) => `rawJSONHasKey(${rawVarName}, "ref")`
        };
      }
      const valProp = v.properties.find((p) => p.name === 'value');
      if (valProp?.schema.kind === 'primitive' && valProp.schema.type === 'string') {
        return {
          suffix: 'String',
          checkExpr: (rawVarName) =>
            `rawJSONHasKey(${rawVarName}, "value") && rawJSONKindIsString(${rawVarName}["value"])`
        };
      }
      if (valProp !== undefined) {
        return {
          suffix: 'Scalar',
          checkExpr: (rawVarName) =>
            `rawJSONHasKey(${rawVarName}, "value") && !rawJSONKindIsString(${rawVarName}["value"])`
        };
      }
      return {
        suffix: `Variant${idx + 1}`,
        checkExpr: () => 'true'
      };
    });
  }

  // 7. 兜底结构性判别
  return variants.map((v, idx) => {
    const requiredKeys = v.properties.filter((p) => p.required).map((p) => p.name);
    const uniqueKey = requiredKeys.find((k) =>
      variants.every((other, oIdx) => oIdx === idx || !other.properties.some((p) => p.name === k))
    );
    if (uniqueKey !== undefined) {
      return {
        suffix: `Variant${idx + 1}`,
        checkExpr: (rawVarName) => `rawJSONHasKey(${rawVarName}, ${toGoStringLiteral(uniqueKey)})`
      };
    }
    return {
      suffix: `Variant${idx + 1}`,
      checkExpr: () => 'true'
    };
  });
};

const isLiftedFieldCompatible = ({
  propA,
  propB
}: {
  propA: IrProperty;
  propB: IrProperty;
}): boolean => {
  const sigA = getIrSchemaSignature(stripSchemaMetaForSig(propA.schema));
  const sigB = getIrSchemaSignature(stripSchemaMetaForSig(propB.schema));
  if (sigA === sigB) return true;

  // 允许跨分支相同底层类型的字面量或枚举（如 type: "llm" vs "stt" 或 status: "deleted" vs enum）提升为通用基础字段
  const isStringConstOrEnum = (s: IrSchema): boolean =>
    (s.kind === 'literal' && typeof s.value === 'string') ||
    (s.kind === 'enum' && s.values.every((v) => typeof v === 'string')) ||
    (s.kind === 'primitive' && s.type === 'string');

  return isStringConstOrEnum(propA.schema) && isStringConstOrEnum(propB.schema);
};

const emitOutputUnion = ({
  schema,
  hintName,
  concept,
  state,
  allowReuse = true
}: {
  schema: Extract<IrSchema, { kind: 'union' }>;
  hintName: string;
  concept: string;
  state: ModelEmitState;
  allowReuse?: boolean;
}): string => {
  const effectiveConcept = isQuoteItemUnion(schema) ? 'quoteItem' : concept;
  const effectiveHintName = isQuoteItemUnion(schema) ? 'ChatQuoteItem' : hintName;

  const dedupeKey = getConceptDedupeKey({
    direction: 'output',
    concept: effectiveConcept,
    schema
  });
  if (allowReuse && state.dedupeMap.has(dedupeKey)) {
    return state.dedupeMap.get(dedupeKey)!;
  }

  const structName = reserveUniqueTypeName({
    preferredName: effectiveHintName,
    usedTypeNames: state.usedTypeNames
  });
  if (allowReuse) {
    state.dedupeMap.set(dedupeKey, structName);
  }

  const nonNullVariants = splitNullableUnion(schema.variants).nonNullVariants;

  if (nonNullVariants.every((v) => v.kind === 'object')) {
    emitObjectOutputUnion({
      structName,
      variants: nonNullVariants as Array<Extract<IrSchema, { kind: 'object' }>>,
      description: schema.description,
      state
    });
    return structName;
  }

  emitMixedOutputUnion({
    structName,
    variants: nonNullVariants,
    description: schema.description,
    state
  });
  return structName;
};

const emitObjectOutputUnion = ({
  structName,
  variants,
  description,
  state
}: {
  structName: string;
  variants: Array<Extract<IrSchema, { kind: 'object' }>>;
  description?: string;
  state: ModelEmitState;
}): void => {
  state.usedImports.add('bytes');
  state.usedImports.add('encoding/json');
  state.usedImports.add('errors');
  state.usesRawJSONHelpers = true;

  // 1. 提取所有分支共有的兼容字段并提升到顶层扁平联合结构体
  const firstVariant = variants[0]!;
  const liftedProps: IrProperty[] = [];
  const liftedWireSet = new Set<string>();

  for (const prop of firstVariant.properties) {
    if (prop.schema.kind === 'never') continue;
    const allMatch = variants.every((v) => {
      const match = v.properties.find((vp) => vp.name === prop.name);
      return match !== undefined && isLiftedFieldCompatible({ propA: prop, propB: match });
    });
    if (!allMatch) continue;

    const allRequired = variants.every((v) => {
      const match = v.properties.find((vp) => vp.name === prop.name);
      return match !== undefined && match.required;
    });
    const hasDifferentLiteralOrEnum = variants.some((v) => {
      const match = v.properties.find((vp) => vp.name === prop.name)!;
      return (
        getIrSchemaSignature(stripSchemaMetaForSig(prop.schema)) !==
        getIrSchemaSignature(stripSchemaMetaForSig(match.schema))
      );
    });

    liftedWireSet.add(prop.name);
    liftedProps.push({
      ...prop,
      required: allRequired,
      schema: hasDifferentLiteralOrEnum ? { kind: 'primitive', type: 'string' } : prop.schema
    });
  }

  const usedNames = new Set<string>(['RawJSON']);
  const entries: StructFieldEntry[] = [];
  for (const prop of liftedProps) {
    const goFieldName = toGoFieldName({ rawName: prop.name, usedNames });
    const resolved = resolvePropertyGoField({
      prop,
      fieldHint: `${structName}${goFieldName}`,
      state
    });
    const fieldDoc = formatGoDocComment({
      lines: [prop.description, resolved.extraNote],
      deprecated: prop.deprecated === true,
      indent: '\t'
    });
    if (fieldDoc.length > 0) {
      for (const commentLine of fieldDoc.trimEnd().split('\n')) {
        entries.push({ kind: 'comment', text: commentLine });
      }
    }
    entries.push({
      kind: 'field',
      name: goFieldName,
      typeExpr: resolved.typeExpr,
      tag: resolved.wireTag
    });
  }

  entries.push({
    kind: 'comment',
    text: '\t// RawJSON holds the original JSON payload, preserving unknown future server variants or fields.'
  });
  entries.push({
    kind: 'field',
    name: 'RawJSON',
    typeExpr: 'json.RawMessage',
    tag: '`json:"-"`'
  });

  const unionDoc = formatGoDocComment({ lines: [description] });
  state.definitions.push(renderAlignedStruct({ structName, doc: unionDoc, entries }));

  const aliasName = `raw${structName}`;
  state.definitions.push(
    [
      `func (u *${structName}) UnmarshalJSON(data []byte) error {`,
      '\tif u == nil {',
      `\t\treturn errors.New(${toGoStringLiteral(`fastgpt.${structName}: UnmarshalJSON on nil pointer`)})`,
      '\t}',
      '\tu.RawJSON = bytes.Clone(data)',
      '\tif bytes.Equal(bytes.TrimSpace(data), []byte("null")) {',
      '\t\treturn nil',
      '\t}',
      `\ttype ${aliasName} ${structName}`,
      `\tvar plain ${aliasName}`,
      '\tif err := json.Unmarshal(data, &plain); err != nil {',
      '\t\tif json.Valid(data) {',
      '\t\t\treturn nil',
      '\t\t}',
      '\t\treturn err',
      '\t}',
      '\tplain.RawJSON = u.RawJSON',
      `\t*u = ${structName}(plain)`,
      '\treturn nil',
      '}',
      '',
      `func (u ${structName}) MarshalJSON() ([]byte, error) {`,
      '\tif len(u.RawJSON) > 0 {',
      '\t\treturn u.RawJSON, nil',
      '\t}',
      `\ttype ${aliasName} ${structName}`,
      `\treturn json.Marshal(${aliasName}(u))`,
      '}'
    ].join('\n')
  );

  // 2. 发射每个具体变体结构体及 As<Variant>() 方法
  const discriminations = describeVariantsForOutputUnion({ variants });
  const usedMethodNames = new Set<string>(['UnmarshalJSON', 'MarshalJSON']);

  variants.forEach((variant, idx) => {
    const disc = discriminations[idx]!;
    let methodSuffix = disc.suffix;
    let methodIdx = 2;
    while (usedMethodNames.has(`As${methodSuffix}`)) {
      methodSuffix = `${disc.suffix}${methodIdx}`;
      methodIdx += 1;
    }
    usedMethodNames.add(`As${methodSuffix}`);

    const preferredVariantName = `${structName}${methodSuffix}`;
    const variantStructName = reserveUniqueTypeName({
      preferredName: state.usedTypeNames.has(preferredVariantName)
        ? `${preferredVariantName}Variant`
        : preferredVariantName,
      usedTypeNames: state.usedTypeNames
    });

    emitObjectStruct({
      structName: variantStructName,
      properties: variant.properties,
      additionalProperties: variant.additionalProperties,
      docLines: [variant.description],
      state
    });

    const checkCode = disc.checkExpr('fields', liftedWireSet);
    const needsFieldsMap = checkCode.includes('fields');

    const lines: string[] = [
      `// As${methodSuffix} decodes the payload as ${variantStructName} when it matches that variant.`,
      `func (u ${structName}) As${methodSuffix}() (*${variantStructName}, bool) {`,
      '\traw := u.RawJSON',
      '\tif len(raw) == 0 {',
      `\t\ttype ${aliasName} ${structName}`,
      `\t\tencoded, err := json.Marshal(${aliasName}(u))`,
      '\t\tif err != nil {',
      '\t\t\treturn nil, false',
      '\t\t}',
      '\t\traw = encoded',
      '\t}'
    ];

    if (needsFieldsMap) {
      lines.push('\tfields := rawJSONFields(raw)');
      lines.push('\tif fields == nil {', '\t\treturn nil, false', '\t}');
    }

    lines.push(`\tif !(${checkCode}) {`, '\t\treturn nil, false', '\t}');
    lines.push(
      `\tvar out ${variantStructName}`,
      '\tif err := json.Unmarshal(raw, &out); err != nil {',
      '\t\treturn nil, false',
      '\t}',
      '\treturn &out, true',
      '}'
    );

    state.definitions.push(lines.join('\n'));
  });
};

const emitMixedOutputUnion = ({
  structName,
  variants,
  description,
  state
}: {
  structName: string;
  variants: IrSchema[];
  description?: string;
  state: ModelEmitState;
}): void => {
  state.usedImports.add('bytes');
  state.usedImports.add('encoding/json');
  state.usedImports.add('errors');

  // 消息内容联合：string | []parts
  const strVar = variants.find((v) => v.kind === 'primitive' && v.type === 'string');
  const arrVar = variants.find((v) => v.kind === 'array');
  if (
    variants.length === 2 &&
    strVar !== undefined &&
    arrVar !== undefined &&
    arrVar.kind === 'array'
  ) {
    const partGoType = renderSchemaToGoType({
      schema: arrVar.items,
      hintName: `${structName}Part`,
      concept: `${structName}Part`,
      state
    });
    const doc = formatGoDocComment({ lines: [description] });
    state.definitions.push(
      renderAlignedStruct({
        structName,
        doc,
        entries: [
          { kind: 'field', name: 'text', typeExpr: 'string', tag: '' },
          { kind: 'field', name: 'parts', typeExpr: `[]${partGoType}`, tag: '' },
          { kind: 'field', name: 'isText', typeExpr: 'bool', tag: '' },
          { kind: 'field', name: 'isParts', typeExpr: 'bool', tag: '' },
          {
            kind: 'field',
            name: 'RawJSON',
            typeExpr: 'json.RawMessage',
            tag: '`json:"-"`'
          }
        ]
      })
    );

    state.definitions.push(
      [
        `// IsText reports whether the content is a plain string.`,
        `func (u ${structName}) IsText() bool {`,
        '\treturn u.isText',
        '}',
        '',
        `// IsParts reports whether the content is a structured slice of parts.`,
        `func (u ${structName}) IsParts() bool {`,
        '\treturn u.isParts',
        '}',
        '',
        `// Text returns the string content and true when the value is a string.`,
        `func (u ${structName}) Text() (string, bool) {`,
        '\tif !u.isText {',
        '\t\treturn "", false',
        '\t}',
        '\treturn u.text, true',
        '}',
        '',
        `// Parts returns the structured parts slice and true when the value is an array.`,
        `func (u ${structName}) Parts() ([]${partGoType}, bool) {`,
        '\tif !u.isParts {',
        '\t\treturn nil, false',
        '\t}',
        '\treturn u.parts, true',
        '}',
        '',
        `func (u *${structName}) UnmarshalJSON(data []byte) error {`,
        '\tif u == nil {',
        `\t\treturn errors.New(${toGoStringLiteral(`fastgpt.${structName}: UnmarshalJSON on nil pointer`)})`,
        '\t}',
        '\tu.RawJSON = bytes.Clone(data)',
        '\tu.isText = false',
        '\tu.isParts = false',
        '\tu.text = ""',
        '\tu.parts = nil',
        '\tif bytes.Equal(bytes.TrimSpace(data), []byte("null")) {',
        '\t\treturn nil',
        '\t}',
        '\tvar s string',
        '\tif err := json.Unmarshal(data, &s); err == nil {',
        '\t\tu.text = s',
        '\t\tu.isText = true',
        '\t\treturn nil',
        '\t}',
        `\tvar arr []${partGoType}`,
        '\tif err := json.Unmarshal(data, &arr); err == nil {',
        '\t\tu.parts = arr',
        '\t\tu.isParts = true',
        '\t\treturn nil',
        '\t}',
        '\tif json.Valid(data) {',
        '\t\treturn nil',
        '\t}',
        `\treturn errors.New(${toGoStringLiteral(`fastgpt.${structName}: invalid JSON`)})`,
        '}',
        '',
        `func (u ${structName}) MarshalJSON() ([]byte, error) {`,
        '\tif u.isText {',
        '\t\treturn json.Marshal(u.text)',
        '\t}',
        '\tif u.isParts {',
        '\t\tif u.parts == nil {',
        '\t\t\treturn []byte("[]"), nil',
        '\t\t}',
        '\t\treturn json.Marshal(u.parts)',
        '\t}',
        '\tif len(u.RawJSON) > 0 {',
        '\t\treturn u.RawJSON, nil',
        '\t}',
        '\treturn []byte("null"), nil',
        '}'
      ].join('\n')
    );
    return;
  }

  // 通用混合联合（如 map|string, string|number|[]string, string|{tag,value}, number|bool, tuple|[]tuple）
  type MixedVariantSlot = {
    fieldName: string;
    flagName: string;
    methodName: string;
    goType: string;
    returnPtr: boolean;
    decodePriority: number;
  };

  const usedSlots = new Set<string>(['RawJSON']);
  const slots: MixedVariantSlot[] = variants.map((variant, idx) => {
    const goType = renderSchemaToGoType({
      schema: variant,
      hintName: `${structName}KV`,
      concept: `${structName}KV`,
      state
    });

    if (variant.kind === 'record') {
      return {
        fieldName: 'objectVal',
        flagName: 'hasObject',
        methodName: 'Object',
        goType,
        returnPtr: false,
        decodePriority: 1
      };
    }
    if (variant.kind === 'object') {
      return {
        fieldName: 'kvVal',
        flagName: 'hasKV',
        methodName: 'KV',
        goType,
        returnPtr: true,
        decodePriority: 1
      };
    }
    if (variant.kind === 'tuple') {
      // tuple | []tuple 时优先尝试切片解码，防止 "[]" 误匹配为 [2]string{"", ""}
      return {
        fieldName: 'singleVal',
        flagName: 'hasSingle',
        methodName: 'Single',
        goType,
        returnPtr: false,
        decodePriority: 4
      };
    }
    if (variant.kind === 'array') {
      const isTupleArr = variant.items.kind === 'tuple';
      const methodName = isTupleArr ? 'List' : 'Strings';
      const fieldName = isTupleArr ? 'listVal' : 'stringsVal';
      const flagName = isTupleArr ? 'hasList' : 'hasStrings';
      return {
        fieldName,
        flagName,
        methodName,
        goType,
        returnPtr: false,
        decodePriority: 2
      };
    }
    if (variant.kind === 'primitive' && variant.type === 'string') {
      return {
        fieldName: 'textVal',
        flagName: 'hasText',
        methodName: 'Text',
        goType,
        returnPtr: false,
        decodePriority: 3
      };
    }
    if (variant.kind === 'primitive' && (variant.type === 'number' || variant.type === 'integer')) {
      return {
        fieldName: 'numberVal',
        flagName: 'hasNumber',
        methodName: 'Number',
        goType,
        returnPtr: false,
        decodePriority: 3
      };
    }
    if (variant.kind === 'primitive' && variant.type === 'boolean') {
      return {
        fieldName: 'boolVal',
        flagName: 'hasBool',
        methodName: 'Bool',
        goType,
        returnPtr: false,
        decodePriority: 3
      };
    }
    const base = `Variant${idx + 1}`;
    usedSlots.add(base);
    return {
      fieldName: `variant${idx + 1}Val`,
      flagName: `hasVariant${idx + 1}`,
      methodName: base,
      goType,
      returnPtr: false,
      decodePriority: 5
    };
  });

  const structEntries: StructFieldEntry[] = [];
  for (const s of slots) {
    structEntries.push({ kind: 'field', name: s.fieldName, typeExpr: s.goType, tag: '' });
    structEntries.push({ kind: 'field', name: s.flagName, typeExpr: 'bool', tag: '' });
  }
  structEntries.push({
    kind: 'field',
    name: 'RawJSON',
    typeExpr: 'json.RawMessage',
    tag: '`json:"-"`'
  });

  const doc = formatGoDocComment({ lines: [description] });
  state.definitions.push(renderAlignedStruct({ structName, doc, entries: structEntries }));

  for (const s of slots) {
    const retType = s.returnPtr ? `*${s.goType}` : s.goType;
    const zeroRet = s.returnPtr
      ? 'nil'
      : s.goType === 'string'
        ? '""'
        : s.goType === 'bool'
          ? 'false'
          : s.goType === 'float64' || s.goType === 'int'
            ? '0'
            : s.goType.startsWith('[') && !s.goType.startsWith('[]')
              ? `${s.goType}{}`
              : 'nil';
    const valExpr = s.returnPtr ? '&val' : `u.${s.fieldName}`;
    state.definitions.push(
      [
        `// ${s.methodName} returns the decoded ${s.goType} variant when present.`,
        `func (u ${structName}) ${s.methodName}() (${retType}, bool) {`,
        `\tif !u.${s.flagName} {`,
        `\t\treturn ${zeroRet}, false`,
        '\t}',
        ...(s.returnPtr ? [`\tval := u.${s.fieldName}`] : []),
        `\treturn ${valExpr}, true`,
        '}'
      ].join('\n')
    );
  }

  const orderedSlots = [...slots].sort((a, b) => a.decodePriority - b.decodePriority);
  const resetLines = slots.map((s) => `\tu.${s.flagName} = false`);
  const decodeBranches = orderedSlots.map((s) =>
    [
      `\tvar dec${s.methodName} ${s.goType}`,
      `\tif err := json.Unmarshal(data, &dec${s.methodName}); err == nil {`,
      `\t\tu.${s.fieldName} = dec${s.methodName}`,
      `\t\tu.${s.flagName} = true`,
      '\t\treturn nil',
      '\t}'
    ].join('\n')
  );

  const marshalBranches = slots.map((s) =>
    [`\tif u.${s.flagName} {`, `\t\treturn json.Marshal(u.${s.fieldName})`, '\t}'].join('\n')
  );

  state.definitions.push(
    [
      `func (u *${structName}) UnmarshalJSON(data []byte) error {`,
      '\tif u == nil {',
      `\t\treturn errors.New(${toGoStringLiteral(`fastgpt.${structName}: UnmarshalJSON on nil pointer`)})`,
      '\t}',
      '\tu.RawJSON = bytes.Clone(data)',
      ...resetLines,
      '\tif bytes.Equal(bytes.TrimSpace(data), []byte("null")) {',
      '\t\treturn nil',
      '\t}',
      ...decodeBranches,
      '\tif json.Valid(data) {',
      '\t\treturn nil',
      '\t}',
      `\treturn errors.New(${toGoStringLiteral(`fastgpt.${structName}: invalid JSON`)})`,
      '}',
      '',
      `func (u ${structName}) MarshalJSON() ([]byte, error) {`,
      ...marshalBranches,
      '\tif len(u.RawJSON) > 0 {',
      '\t\treturn u.RawJSON, nil',
      '\t}',
      '\treturn []byte("null"), nil',
      '}'
    ].join('\n')
  );
};

const emitTopRequestUnionConstructors = ({
  opId,
  ifaceName,
  variantStructNames,
  state
}: {
  opId: string;
  ifaceName: string;
  variantStructNames: string[];
  state: ModelEmitState;
}): void => {
  if (opId === 'datasets.collections.delete') {
    const [byID, byIDs, byAPIFiles] = variantStructNames;
    if (byID !== undefined && byIDs !== undefined && byAPIFiles !== undefined) {
      state.definitions.push(
        [
          `// DeleteCollectionByID constructs a ${ifaceName} targeting a single collection ID.`,
          `func DeleteCollectionByID(id string) ${byID} {`,
          `\treturn ${byID}{ID: id}`,
          '}',
          '',
          `// DeleteCollectionsByIDs constructs a ${ifaceName} targeting multiple collection IDs.`,
          `func DeleteCollectionsByIDs(collectionIDs ...string) ${byIDs} {`,
          `\treturn ${byIDs}{CollectionIDs: collectionIDs}`,
          '}',
          '',
          `// DeleteCollectionsByAPIFiles constructs a ${ifaceName} targeting external API file IDs in a dataset.`,
          `func DeleteCollectionsByAPIFiles(datasetID string, apiFileIDs ...string) ${byAPIFiles} {`,
          `\treturn ${byAPIFiles}{DatasetID: datasetID, APIFileIDs: apiFileIDs}`,
          '}'
        ].join('\n')
      );
    }
    return;
  }

  if (opId === 'datasets.collections.update') {
    const [byID, byExternal] = variantStructNames;
    if (byID !== undefined && byExternal !== undefined) {
      state.definitions.push(
        [
          `// UpdateCollectionByID constructs a ${ifaceName} targeting a collection by ID.`,
          `func UpdateCollectionByID(id string) ${byID} {`,
          `\treturn ${byID}{ID: id}`,
          '}',
          '',
          `// UpdateCollectionByExternalFile constructs a ${ifaceName} targeting a collection by datasetId + externalFileId.`,
          `func UpdateCollectionByExternalFile(datasetID, externalFileID string) ${byExternal} {`,
          `\treturn ${byExternal}{DatasetID: datasetID, ExternalFileID: externalFileID}`,
          '}'
        ].join('\n')
      );
    }
  }
};

/** 生成 sdk/go/models_gen.go 源码字符串。 */
export const emitGoModelsFile = (ir: SdkIrDocument): string => {
  const usedTypeNames = new Set<string>(RESERVED_PACKAGE_SYMBOLS);

  for (const op of ir.operations) {
    if (op.requestTypeName !== undefined) {
      usedTypeNames.add(toGoRequestTypeName(op.requestTypeName));
    }
    if (op.responseTypeName !== undefined) {
      usedTypeNames.add(op.responseTypeName);
    }
    usedTypeNames.add(toGoResourceStructName(op.resource));
  }

  const state: ModelEmitState = {
    direction: 'input',
    dedupeMap: new Map(),
    usedTypeNames,
    definitions: [],
    usedImports: new Set(),
    usesRawJSONHelpers: false,
    usesExtraPropsHelpers: false,
    chatPartTypeCache: new Map()
  };

  for (const op of ir.operations) {
    if (op.requestTypeName !== undefined && op.requestSchema !== undefined) {
      state.direction = 'input';
      const topName = toGoRequestTypeName(op.requestTypeName);
      const doc = formatGoDocComment({
        lines: [`${topName} holds parameters for ${op.id} (${op.httpMethod} ${op.path}).`]
      });

      if (op.requestSchema.kind === 'object') {
        emitObjectStruct({
          structName: topName,
          properties: op.requestSchema.properties,
          docLines: [`${topName} holds parameters for ${op.id} (${op.httpMethod} ${op.path}).`],
          state
        });
      } else {
        const marker = `is${topName}()`;
        state.definitions.push(`${doc}type ${topName} interface {\n\t${marker}\n}`);
        const variantStructNames: string[] = [];

        op.requestSchema.variants.forEach((variant, idx) => {
          const suffix = deriveInputObjectVariantSuffix({ variant, variantIndex: idx });
          const variantStructName = reserveUniqueTypeName({
            preferredName: `${topName}${suffix}`,
            usedTypeNames: state.usedTypeNames
          });
          variantStructNames.push(variantStructName);
          emitObjectStruct({
            structName: variantStructName,
            properties: variant.properties,
            docLines: [variant.description ?? `${topName} variant ${idx + 1}.`],
            state
          });
          state.definitions.push(
            formatMarkerMethod({ receiver: variantStructName, method: marker })
          );
        });

        emitTopRequestUnionConstructors({
          opId: op.id,
          ifaceName: topName,
          variantStructNames,
          state
        });
      }
    }

    if (op.responseTypeName !== undefined && op.responseSchema !== undefined) {
      state.direction = 'output';
      const topName = op.responseTypeName;
      const doc = formatGoDocComment({
        lines: [
          `${topName} represents the response payload for ${op.id} (${op.httpMethod} ${op.path}).`
        ]
      });

      if (op.responseSchema.kind === 'object') {
        emitObjectStruct({
          structName: topName,
          properties: op.responseSchema.properties,
          additionalProperties: op.responseSchema.additionalProperties,
          docLines: [
            `${topName} represents the response payload for ${op.id} (${op.httpMethod} ${op.path}).`
          ],
          state
        });
      } else if (op.responseSchema.kind === 'union') {
        const nonNullVariants = splitNullableUnion(op.responseSchema.variants).nonNullVariants;
        if (nonNullVariants.every((v) => v.kind === 'object')) {
          emitObjectOutputUnion({
            structName: topName,
            variants: nonNullVariants as Array<Extract<IrSchema, { kind: 'object' }>>,
            description: `${topName} represents the response payload for ${op.id} (${op.httpMethod} ${op.path}).`,
            state
          });
        } else {
          emitMixedOutputUnion({
            structName: topName,
            variants: nonNullVariants,
            description: `${topName} represents the response payload for ${op.id} (${op.httpMethod} ${op.path}).`,
            state
          });
        }
      } else if (op.responseMode === 'binary') {
        state.definitions.push(`${doc}type ${topName} = *BinaryStream`);
      } else {
        const targetType = renderSchemaToGoType({
          schema: op.responseSchema,
          hintName: topName,
          concept: topName,
          state,
          allowReuse: false
        });
        state.definitions.push(`${doc}type ${topName} = ${targetType}`);
      }
    }
  }

  if (state.usesRawJSONHelpers) {
    state.usedImports.add('bytes');
    state.usedImports.add('encoding/json');
    state.definitions.push(
      [
        'func rawJSONFields(raw json.RawMessage) map[string]json.RawMessage {',
        '\tvar fields map[string]json.RawMessage',
        '\tif err := json.Unmarshal(raw, &fields); err != nil {',
        '\t\treturn nil',
        '\t}',
        '\treturn fields',
        '}',
        '',
        'func rawJSONHasKey(fields map[string]json.RawMessage, key string) bool {',
        '\t_, ok := fields[key]',
        '\treturn ok',
        '}',
        '',
        'func rawJSONStringEquals(fields map[string]json.RawMessage, key, want string) bool {',
        '\traw, ok := fields[key]',
        '\tif !ok {',
        '\t\treturn false',
        '\t}',
        '\tvar got string',
        '\treturn json.Unmarshal(raw, &got) == nil && got == want',
        '}',
        '',
        'func rawJSONKindIsString(raw json.RawMessage) bool {',
        '\ttrimmed := bytes.TrimSpace(raw)',
        "\treturn len(trimmed) > 0 && trimmed[0] == '\"'",
        '}'
      ].join('\n')
    );
  }

  if (state.usesExtraPropsHelpers) {
    state.usedImports.add('encoding/json');
    state.definitions.push(
      [
        'func unmarshalExtraFields(data []byte, dst any, knownKeys map[string]struct{}) (map[string]any, error) {',
        '\tif err := json.Unmarshal(data, dst); err != nil {',
        '\t\treturn nil, err',
        '\t}',
        '\tvar rawMap map[string]any',
        '\tif err := json.Unmarshal(data, &rawMap); err != nil || len(rawMap) == 0 {',
        '\t\treturn nil, nil',
        '\t}',
        '\tvar extra map[string]any',
        '\tfor k, v := range rawMap {',
        '\t\tif _, ok := knownKeys[k]; !ok {',
        '\t\t\tif extra == nil {',
        '\t\t\t\textra = make(map[string]any)',
        '\t\t\t}',
        '\t\t\textra[k] = v',
        '\t\t}',
        '\t}',
        '\treturn extra, nil',
        '}',
        '',
        'func marshalWithExtraFields(src any, extra map[string]any) ([]byte, error) {',
        '\tbaseBytes, err := json.Marshal(src)',
        '\tif err != nil || len(extra) == 0 {',
        '\t\treturn baseBytes, err',
        '\t}',
        '\tvar merged map[string]any',
        '\tif err := json.Unmarshal(baseBytes, &merged); err != nil {',
        '\t\treturn nil, err',
        '\t}',
        '\tif merged == nil {',
        '\t\tmerged = make(map[string]any, len(extra))',
        '\t}',
        '\tfor k, v := range extra {',
        '\t\tif _, exists := merged[k]; !exists {',
        '\t\t\tmerged[k] = v',
        '\t\t}',
        '\t}',
        '\treturn json.Marshal(merged)',
        '}'
      ].join('\n')
    );
  }

  return renderGoFile({
    imports: state.usedImports,
    blocks: state.definitions
  });
};

const mapRequestContentType = (ct: IrOperation['requestContentType']): string => {
  switch (ct) {
    case 'none':
      return 'contentNone';
    case 'json':
      return 'contentJSON';
    case 'multipart':
      return 'contentMultipart';
    case 'octet-stream':
      return 'contentBinary';
  }
};

const mapMultipartMode = (mode: IrOperation['multipartMode']): string => {
  switch (mode) {
    case 'fileAndJsonData':
      return 'multipartFileAndJSONData';
    case 'flatFields':
      return 'multipartFlatFields';
    case undefined:
      return 'multipartNone';
  }
};

const mapResponseMode = (mode: IrOperation['responseMode']): string => {
  switch (mode) {
    case 'envelope':
      return 'responseEnvelope';
    case 'rawJson':
      return 'responseRawJSON';
    case 'binary':
      return 'responseBinary';
    case 'void':
      return 'responseVoid';
    case 'text':
      throw new Error(`Unsupported Go SDK response mode: ${mode}`);
  }
};

const mapCarrier = (carrier: IrOperation['appIdCarrier']): string => {
  switch (carrier) {
    case null:
      return 'carrierNone';
    case 'query':
      return 'carrierQuery';
    case 'body':
      return 'carrierBody';
    case 'multipartData':
      throw new Error(`Unsupported Go SDK paramCarrier: ${carrier}`);
  }
};

const formatGoStringSliceLiteral = (items: string[]): string => {
  if (items.length === 0) return 'nil';
  return `[]string{${items.map(toGoStringLiteral).join(', ')}}`;
};

const getOperationReturnSpec = (
  op: IrOperation
): { returnType: string; isPointerStruct: boolean } => {
  if (op.responseMode === 'void') {
    return { returnType: '', isPointerStruct: false };
  }
  if (op.responseMode === 'binary') {
    return { returnType: '*BinaryStream', isPointerStruct: true };
  }
  const resType = op.responseTypeName!;
  if (op.responseSchema?.kind === 'object' || op.responseSchema?.kind === 'union') {
    return { returnType: `*${resType}`, isPointerStruct: true };
  }
  return { returnType: resType, isPointerStruct: false };
};

const renderGoResourceMethods = ({
  structName,
  op
}: {
  structName: string;
  op: IrOperation;
}): string => {
  const specVar = toGoSpecVarName(op.id);
  const methodName = toGoPascalCase(op.method);
  const hasParams = op.requestTypeName !== undefined;
  const paramsSig = hasParams
    ? `ctx context.Context, params ${toGoRequestTypeName(op.requestTypeName!)}, opts ...RequestOption`
    : 'ctx context.Context, opts ...RequestOption';
  const reqArg = hasParams ? 'params' : 'nil';
  const isDualMode = op.streamMethod !== undefined && op.requestContentType === 'json';
  const mainFixedFields = isDualMode ? 'map[string]any{"stream": false}' : 'nil';

  const doc = formatGoDocComment({
    lines: [op.summary, op.description ? op.description.split('\n')[0] : undefined]
  });

  const mainMethod = (() => {
    if (op.responseMode === 'void') {
      return [
        `${doc}func (r *${structName}) ${methodName}(${paramsSig}) error {`,
        `\treturn r.client.doVoid(ctx, ${specVar}, ${reqArg}, ${mainFixedFields}, opts...)`,
        '}'
      ].join('\n');
    }

    if (op.responseMode === 'binary') {
      return [
        `${doc}func (r *${structName}) ${methodName}(${paramsSig}) (*BinaryStream, error) {`,
        `\treturn r.client.doBinary(ctx, ${specVar}, ${reqArg}, opts...)`,
        '}'
      ].join('\n');
    }

    const { returnType, isPointerStruct } = getOperationReturnSpec(op);
    const resTypeName = op.responseTypeName!;
    if (isPointerStruct) {
      return [
        `${doc}func (r *${structName}) ${methodName}(${paramsSig}) (${returnType}, error) {`,
        `\tvar out ${resTypeName}`,
        `\tif err := r.client.doJSON(ctx, ${specVar}, ${reqArg}, ${mainFixedFields}, &out, opts...); err != nil {`,
        '\t\treturn nil, err',
        '\t}',
        '\treturn &out, nil',
        '}'
      ].join('\n');
    }

    const zeroExpr = (() => {
      if (op.responseSchema?.kind === 'primitive') {
        if (op.responseSchema.type === 'string') return '""';
        if (op.responseSchema.type === 'boolean') return 'false';
        if (op.responseSchema.type === 'integer' || op.responseSchema.type === 'number') return '0';
      }
      return 'nil';
    })();
    return [
      `${doc}func (r *${structName}) ${methodName}(${paramsSig}) (${returnType}, error) {`,
      `\tvar out ${resTypeName}`,
      `\tif err := r.client.doJSON(ctx, ${specVar}, ${reqArg}, ${mainFixedFields}, &out, opts...); err != nil {`,
      `\t\treturn ${zeroExpr}, err`,
      '\t}',
      '\treturn out, nil',
      '}'
    ].join('\n');
  })();

  if (op.streamMethod === undefined) {
    return mainMethod;
  }

  const streamMethodName = toGoPascalCase(op.streamMethod);
  const streamFixedFields = isDualMode ? 'map[string]any{"stream": true}' : 'nil';
  const streamDoc = formatGoDocComment({
    lines: [`${op.summary} (SSE streaming response).`]
  });

  const streamMethod = [
    `${streamDoc}func (r *${structName}) ${streamMethodName}(${paramsSig}) (*ChatStream, error) {`,
    `\treturn r.client.doStream(ctx, ${specVar}, ${reqArg}, ${streamFixedFields}, opts...)`,
    '}'
  ].join('\n');

  return `${mainMethod}\n\n${streamMethod}`;
};

/** 生成 sdk/go/resources_gen.go 源码字符串。 */
export const emitGoResourcesFile = (ir: SdkIrDocument): string => {
  const specBlocks: string[] = ir.operations.map((op) => {
    const fields: Array<{ key: string; value: string }> = [
      { key: 'ID', value: toGoStringLiteral(op.id) },
      { key: 'Method', value: toGoStringLiteral(op.httpMethod) },
      { key: 'Path', value: toGoStringLiteral(op.path) },
      { key: 'RequestContentType', value: mapRequestContentType(op.requestContentType) },
      { key: 'MultipartMode', value: mapMultipartMode(op.multipartMode) },
      { key: 'ResponseMode', value: mapResponseMode(op.responseMode) },
      { key: 'AppIDCarrier', value: mapCarrier(op.appIdCarrier) },
      { key: 'IdentityCarrier', value: mapCarrier(op.identityCarrier) },
      { key: 'PathParams', value: formatGoStringSliceLiteral(op.pathParams) },
      { key: 'QueryParams', value: formatGoStringSliceLiteral(op.queryParams) },
      { key: 'BodyParams', value: formatGoStringSliceLiteral(op.bodyParams) }
    ];
    if (op.binaryBodyField !== undefined) {
      fields.push({ key: 'BinaryBodyField', value: toGoStringLiteral(op.binaryBodyField) });
    }
    if (op.retryable !== undefined) {
      fields.push({
        key: 'RetryPolicy',
        value: op.retryable ? 'retryPolicyEnabled' : 'retryPolicyDisabled'
      });
    }
    return renderAlignedCompositeLiteral({
      typeName: 'operationSpec',
      varName: toGoSpecVarName(op.id),
      fields
    });
  });

  const resourceBlocks: string[] = [];

  const emitNode = (node: IrResourceNode): void => {
    for (const child of node.children) {
      emitNode(child);
    }

    const structName = toGoResourceStructName(node.fullPath);
    const ctorName = toGoResourceConstructorName(node.fullPath);

    const structEntries: StructFieldEntry[] = [
      { kind: 'field', name: 'client', typeExpr: '*Client', tag: '' }
    ];
    const ctorFields: Array<{ key: string; value: string }> = [{ key: 'client', value: 'client' }];

    for (const child of node.children) {
      const fieldName = toGoPascalCase(child.name);
      const childStruct = toGoResourceStructName(child.fullPath);
      const childCtor = toGoResourceConstructorName(child.fullPath);
      structEntries.push({ kind: 'field', name: fieldName, typeExpr: `*${childStruct}`, tag: '' });
      ctorFields.push({ key: fieldName, value: `${childCtor}(client)` });
    }

    resourceBlocks.push(renderAlignedStruct({ structName, entries: structEntries }));

    const maxKeyColonLen = Math.max(...ctorFields.map((f) => f.key.length + 1));
    const ctorBody = ctorFields
      .map((f) => `\t\t${`${f.key}:`.padEnd(maxKeyColonLen)} ${f.value},`)
      .join('\n');

    resourceBlocks.push(
      [
        `func ${ctorName}(client *Client) *${structName} {`,
        `\treturn &${structName}{`,
        ctorBody,
        '\t}',
        '}'
      ].join('\n')
    );

    for (const op of node.operations) {
      resourceBlocks.push(renderGoResourceMethods({ structName, op }));
    }
  };

  for (const rootNode of ir.resources) {
    emitNode(rootNode);
  }

  return renderGoFile({
    imports: ['context'],
    blocks: [...specBlocks, ...resourceBlocks]
  });
};
