import type { IrOperation, IrProperty, IrResourceNode, IrSchema, SdkIrDocument } from './irTypes';

const PYTHON_KEYWORDS = new Set<string>([
  'False',
  'None',
  'True',
  'and',
  'as',
  'assert',
  'async',
  'await',
  'break',
  'class',
  'continue',
  'def',
  'del',
  'elif',
  'else',
  'except',
  'finally',
  'for',
  'from',
  'global',
  'if',
  'import',
  'in',
  'is',
  'lambda',
  'nonlocal',
  'not',
  'or',
  'pass',
  'raise',
  'return',
  'try',
  'while',
  'with',
  'yield',
  'match',
  'case'
]);

const PYDANTIC_RESERVED_ATTRS = new Set<string>([
  'model_config',
  'model_fields',
  'model_computed_fields',
  'model_extra',
  'model_fields_set',
  'model_dump',
  'model_dump_json',
  'model_validate',
  'model_validate_json',
  'model_copy',
  'model_json_schema',
  'model_post_init',
  'model_rebuild'
]);

const SHADOWABLE_BUILTINS = new Set<string>([
  'list',
  'dict',
  'tuple',
  'set',
  'str',
  'int',
  'float',
  'bool',
  'bytes'
]);

const capitalize = (word: string): string =>
  word.length === 0 ? '' : `${word[0]!.toUpperCase()}${word.slice(1)}`;

const toPascalCase = (input: string): string =>
  input
    .split(/[^A-Za-z0-9]+/)
    .filter((segment) => segment.length > 0)
    .map(capitalize)
    .join('');

const classifyPythonImportOrder = (name: string): number => {
  if (/^[A-Z][A-Z0-9_]*$/.test(name)) return 0; // CONSTANT_CASE（如 TYPE_CHECKING / NOT_GIVEN）
  if (/^[A-Z]/.test(name)) return 1; // PascalCase（类名与 TypeAlias）
  return 2; // snake_case（函数与装饰器如 overload）
};

/** 按 Ruff/isort 默认 `order-by-type=true` 规则排序 Python 导入符号，保证生成代码零导入排序告警。 */
const comparePythonImportNames = (a: string, b: string): number => {
  const rankDiff = classifyPythonImportOrder(a) - classifyPythonImportOrder(b);
  if (rankDiff !== 0) return rankDiff;
  return a.localeCompare(b, 'en', { sensitivity: 'base' }) || a.localeCompare(b);
};

/**
 * 将 camelCase / kebab-case / dot-path 标识符确定性地转换为符合 PEP 8 的 Python snake_case 标识符。
 */
export const toPythonSnakeCase = (input: string): string =>
  input
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();

const allocatePythonFieldName = ({
  rawName,
  usedNames
}: {
  rawName: string;
  usedNames: Set<string>;
}): string => {
  let candidate = toPythonSnakeCase(rawName);
  if (candidate.length === 0) {
    candidate = 'field';
  }
  if (/^[0-9]/.test(candidate)) {
    candidate = `f_${candidate}`;
  }
  // 将 `_id` 这类以下划线开头的契约字段转为后置下划线 `id_`，既避开 Pydantic 私有属性限制又避免与同级 `id` 冲突。
  if (rawName.startsWith('_')) {
    candidate = `${candidate}_`;
  }
  if (PYTHON_KEYWORDS.has(candidate) || PYDANTIC_RESERVED_ATTRS.has(candidate)) {
    candidate = `${candidate}_`;
  }

  let resolved = candidate;
  let suffix = 2;
  while (usedNames.has(resolved)) {
    resolved = `${candidate}_${suffix}`;
    suffix += 1;
  }
  usedNames.add(resolved);
  return resolved;
};

const toPythonStringLiteral = (raw: string): string =>
  JSON.stringify(
    raw
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ')
      .trim()
  );

const formatPythonDocstring = ({
  lines,
  indent = '    '
}: {
  lines: Array<string | undefined>;
  indent?: string;
}): string => {
  const cleaned = lines
    .filter((line): line is string => line !== undefined && line.trim().length > 0)
    .flatMap((line) => line.replace(/"""/g, '\\"""').trim().split('\n'))
    .map((line) => line.trimEnd());

  if (cleaned.length === 0) {
    return '';
  }
  if (cleaned.length === 1) {
    return `${indent}"""${cleaned[0]}"""\n`;
  }
  return `${indent}"""${cleaned[0]}\n\n${cleaned
    .slice(1)
    .map((line) => (line.length > 0 ? `${indent}${line}` : ''))
    .join('\n')}\n${indent}"""\n`;
};

const renderPythonLiteralValue = (val: string | number | boolean): string => {
  if (typeof val === 'boolean') {
    return val ? 'True' : 'False';
  }
  if (typeof val === 'number') {
    return String(val);
  }
  return toPythonStringLiteral(val);
};

type ModelEmitState = {
  direction: 'input' | 'output';
  isOctetStreamInput: boolean;
  dedupeMap: Map<string, string>;
  usedClassNames: Set<string>;
  definitions: string[];
  usedTypingNames: Set<string>;
  usedOptionsImports: Set<string>;
  usedPydanticImports: Set<string>;
  usesBuiltins: boolean;
};

const reserveUniqueClassName = ({
  preferredName,
  usedClassNames
}: {
  preferredName: string;
  usedClassNames: Set<string>;
}): string => {
  let candidate = preferredName.length > 0 ? preferredName : 'AnonymousModel';
  if (/^[0-9]/.test(candidate)) {
    candidate = `Model${candidate}`;
  }
  if (!usedClassNames.has(candidate)) {
    usedClassNames.add(candidate);
    return candidate;
  }
  let idx = 2;
  while (usedClassNames.has(`${candidate}_${idx}`)) {
    idx += 1;
  }
  const unique = `${candidate}_${idx}`;
  usedClassNames.add(unique);
  return unique;
};

const buildTypeWrapper = ({
  name,
  args,
  shadowedBuiltins,
  state
}: {
  name: string;
  args?: string;
  shadowedBuiltins?: Set<string>;
  state: ModelEmitState;
}): string => {
  const qualifiedName = (() => {
    if (shadowedBuiltins !== undefined && shadowedBuiltins.has(name)) {
      state.usesBuiltins = true;
      return `_builtins.${name}`;
    }
    return name;
  })();
  return args !== undefined ? `${qualifiedName}[${args}]` : qualifiedName;
};

const renderIrSchemaToPythonType = ({
  schema,
  hintName,
  state,
  isOctetField = false,
  shadowedBuiltins,
  allowReuse = true
}: {
  schema: IrSchema;
  hintName: string;
  state: ModelEmitState;
  isOctetField?: boolean;
  shadowedBuiltins?: Set<string>;
  allowReuse?: boolean;
}): string => {
  switch (schema.kind) {
    case 'primitive': {
      if (schema.type === 'string') {
        return buildTypeWrapper({ name: 'str', shadowedBuiltins, state });
      }
      if (schema.type === 'integer') {
        return buildTypeWrapper({ name: 'int', shadowedBuiltins, state });
      }
      if (schema.type === 'number') {
        return buildTypeWrapper({ name: 'float', shadowedBuiltins, state });
      }
      if (schema.type === 'boolean') {
        return buildTypeWrapper({ name: 'bool', shadowedBuiltins, state });
      }
      return 'None';
    }
    case 'literal': {
      if (typeof schema.value === 'number' && !Number.isInteger(schema.value)) {
        return buildTypeWrapper({ name: 'float', shadowedBuiltins, state });
      }
      state.usedTypingNames.add('Literal');
      return `Literal[${renderPythonLiteralValue(schema.value)}]`;
    }
    case 'enum': {
      const literalVals = schema.values.filter((v) => typeof v !== 'number' || Number.isInteger(v));
      const hasFloatVal = schema.values.some((v) => typeof v === 'number' && !Number.isInteger(v));
      const parts: string[] = [];
      if (literalVals.length > 0) {
        state.usedTypingNames.add('Literal');
        parts.push(`Literal[${literalVals.map(renderPythonLiteralValue).join(', ')}]`);
      }
      if (hasFloatVal) {
        parts.push(buildTypeWrapper({ name: 'float', shadowedBuiltins, state }));
      }
      return parts.length > 0
        ? parts.join(' | ')
        : buildTypeWrapper({ name: 'str', shadowedBuiltins, state });
    }
    case 'binary': {
      if (state.direction === 'output') {
        return buildTypeWrapper({ name: 'bytes', shadowedBuiltins, state });
      }
      if (isOctetField) {
        state.usedOptionsImports.add('BinaryInput');
        return 'BinaryInput';
      }
      state.usedOptionsImports.add('Uploadable');
      if (schema.multiple === true) {
        state.usedTypingNames.add('Sequence');
        return 'Uploadable | Sequence[Uploadable]';
      }
      return 'Uploadable';
    }
    case 'never':
      return 'None';
    case 'unknown': {
      state.usedTypingNames.add('Any');
      return 'Any';
    }
    case 'array': {
      const itemHint = `${hintName}Item`;
      if (schema.items.kind === 'union' && allowReuse) {
        const dedupeKey = `${state.direction}:union:${JSON.stringify(schema.items)}`;
        if (state.dedupeMap.has(dedupeKey)) {
          const aliasName = state.dedupeMap.get(dedupeKey)!;
          return buildTypeWrapper({ name: 'list', args: aliasName, shadowedBuiltins, state });
        }
        const unionExpr = renderIrSchemaToPythonType({
          schema: schema.items,
          hintName: itemHint,
          state
        });
        const aliasName = reserveUniqueClassName({
          preferredName: itemHint,
          usedClassNames: state.usedClassNames
        });
        state.dedupeMap.set(dedupeKey, aliasName);
        state.usedTypingNames.add('TypeAlias');
        state.definitions.push(`${aliasName}: TypeAlias = ${unionExpr}`);
        return buildTypeWrapper({ name: 'list', args: aliasName, shadowedBuiltins, state });
      }
      const itemType = renderIrSchemaToPythonType({
        schema: schema.items,
        hintName: itemHint,
        state,
        shadowedBuiltins
      });
      return buildTypeWrapper({ name: 'list', args: itemType, shadowedBuiltins, state });
    }
    case 'tuple': {
      if (schema.items.length === 0) {
        return buildTypeWrapper({ name: 'tuple', args: '()', shadowedBuiltins, state });
      }
      const itemTypes = schema.items.map((item, idx) =>
        renderIrSchemaToPythonType({
          schema: item,
          hintName: `${hintName}Item${idx + 1}`,
          state,
          shadowedBuiltins
        })
      );
      return buildTypeWrapper({
        name: 'tuple',
        args: itemTypes.join(', '),
        shadowedBuiltins,
        state
      });
    }
    case 'record': {
      const valueType = renderIrSchemaToPythonType({
        schema: schema.valueType,
        hintName: `${hintName}Value`,
        state,
        shadowedBuiltins
      });
      const keyType = buildTypeWrapper({ name: 'str', shadowedBuiltins, state });
      return buildTypeWrapper({
        name: 'dict',
        args: `${keyType}, ${valueType}`,
        shadowedBuiltins,
        state
      });
    }
    case 'union': {
      const parts: string[] = [];
      let variantIdx = 1;
      for (const variant of schema.variants) {
        const rendered = renderIrSchemaToPythonType({
          schema: variant,
          hintName: `${hintName}Variant${variantIdx}`,
          state,
          shadowedBuiltins
        });
        if (!parts.includes(rendered)) {
          parts.push(rendered);
        }
        if (variant.kind === 'object') {
          variantIdx += 1;
        }
      }
      return parts.join(' | ');
    }
    case 'object': {
      if (schema.properties.length === 0) {
        const keyType = buildTypeWrapper({ name: 'str', shadowedBuiltins, state });
        if (
          schema.additionalProperties !== undefined &&
          typeof schema.additionalProperties === 'object'
        ) {
          const valType = renderIrSchemaToPythonType({
            schema: schema.additionalProperties,
            hintName: `${hintName}Value`,
            state,
            shadowedBuiltins
          });
          return buildTypeWrapper({
            name: 'dict',
            args: `${keyType}, ${valType}`,
            shadowedBuiltins,
            state
          });
        }
        state.usedTypingNames.add('Any');
        return buildTypeWrapper({
          name: 'dict',
          args: `${keyType}, Any`,
          shadowedBuiltins,
          state
        });
      }

      const dedupeKey = `${state.direction}:${JSON.stringify(schema)}`;
      if (allowReuse && state.dedupeMap.has(dedupeKey)) {
        return state.dedupeMap.get(dedupeKey)!;
      }

      const className = reserveUniqueClassName({
        preferredName: hintName,
        usedClassNames: state.usedClassNames
      });
      if (allowReuse) {
        state.dedupeMap.set(dedupeKey, className);
      }

      emitObjectModelClass({
        className,
        properties: schema.properties,
        description: schema.description,
        state
      });
      return className;
    }
  }
};

const emitObjectModelClass = ({
  className,
  properties,
  description,
  state
}: {
  className: string;
  properties: IrProperty[];
  description?: string;
  state: ModelEmitState;
}): void => {
  const baseClass = state.direction === 'input' ? 'FastGPTRequestModel' : 'FastGPTResponseModel';
  state.usedOptionsImports.add(baseClass);

  // 先为所有属性分配 Python 字段名，并收集会遮蔽内置类型（如 list / str / dict）的字段集合，
  // 以便在同一 class 体内引用对应内置类型时统一使用 `_builtins.<name>`，避免 Python 作用域与 mypy 报错。
  const usedNames = new Set<string>();
  const allocated = properties.map((prop) => ({
    prop,
    pyName: allocatePythonFieldName({ rawName: prop.name, usedNames })
  }));

  const shadowedBuiltins = new Set<string>();
  for (const item of allocated) {
    if (SHADOWABLE_BUILTINS.has(item.pyName)) {
      shadowedBuiltins.add(item.pyName);
    }
  }

  const lines: string[] = [`class ${className}(${baseClass}):`];
  const doc = formatPythonDocstring({ lines: [description], indent: '    ' });
  if (doc.length > 0) {
    lines.push(doc.trimEnd());
  }

  for (const { prop, pyName } of allocated) {
    const isNever = prop.schema.kind === 'never';
    const isOctetField =
      state.isOctetStreamInput && prop.name === 'file' && prop.schema.kind === 'binary';

    const baseType = isNever
      ? 'None'
      : renderIrSchemaToPythonType({
          schema: prop.schema,
          hintName: `${className}${toPascalCase(prop.name) || 'Field'}`,
          state,
          isOctetField,
          shadowedBuiltins
        });

    const needsOptionalNone = !isNever && !prop.required && !baseType.split(' | ').includes('None');
    const annotation = needsOptionalNone ? `${baseType} | None` : baseType;

    const fieldArgs: string[] = [];
    if (isNever || !prop.required) {
      fieldArgs.push('default=None');
    }
    if (pyName !== prop.name) {
      // 同时使用 validation_alias(AliasChoices) 与 serialization_alias：
      // 让纯 mypy --strict / Pyright 在无需 Pydantic 插件时也能认出 snake_case 构造参数，同时双向兼容 camelCase JSON。
      state.usedPydanticImports.add('AliasChoices');
      fieldArgs.push(
        `validation_alias=AliasChoices(${toPythonStringLiteral(pyName)}, ${toPythonStringLiteral(prop.name)})`
      );
      fieldArgs.push(`serialization_alias=${toPythonStringLiteral(prop.name)}`);
    }
    if (isNever) {
      fieldArgs.push('exclude=True');
    }
    if (prop.description !== undefined && prop.description.trim().length > 0) {
      fieldArgs.push(`description=${toPythonStringLiteral(prop.description)}`);
    }
    if (prop.deprecated === true) {
      fieldArgs.push('deprecated=True');
    }

    if (fieldArgs.length === 0) {
      lines.push(`    ${pyName}: ${annotation}`);
    } else if (fieldArgs.length === 1 && fieldArgs[0] === 'default=None') {
      lines.push(`    ${pyName}: ${annotation} = None`);
    } else {
      state.usedPydanticImports.add('Field');
      lines.push(`    ${pyName}: ${annotation} = Field(${fieldArgs.join(', ')})`);
    }
  }

  state.definitions.push(lines.join('\n'));
};

const toSpecConstName = (operationId: string): string =>
  `_${operationId
    .replace(/\./g, '_')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toUpperCase()}_SPEC`;

const toResourceClassName = ({
  fullPath,
  prefix = ''
}: {
  fullPath: string;
  prefix?: string;
}): string => `${prefix}${fullPath.split('.').map(capitalize).join('')}Resource`;

const formatPythonTuple = (items: string[]): string => {
  if (items.length === 0) return '()';
  if (items.length === 1) return `(${toPythonStringLiteral(items[0]!)},)`;
  return `(${items.map(toPythonStringLiteral).join(', ')})`;
};

type RequestFieldMeta = {
  rawName: string;
  pyName: string;
  annotation: string;
  kwargAnnotation: string;
  required: boolean;
  isNever: boolean;
};

const isNullIrSchema = (schema: IrSchema): boolean =>
  schema.kind === 'primitive' && schema.type === 'null';

const schemaContainsObjectOrRecord = (schema: IrSchema): boolean => {
  switch (schema.kind) {
    case 'object':
    case 'record':
      return true;
    case 'array':
      return schemaContainsObjectOrRecord(schema.items);
    case 'tuple':
      return schema.items.some(schemaContainsObjectOrRecord);
    case 'union':
      return schema.variants.some(schemaContainsObjectOrRecord);
    default:
      return false;
  }
};

const widenPythonKwargAnnotation = ({
  schema,
  baseType
}: {
  schema: IrSchema;
  baseType: string;
}): string => {
  if (schema.kind === 'object') {
    if (schema.properties.length === 0 && baseType.startsWith('dict[')) {
      return `Mapping[${baseType.slice(5)}`;
    }
    return `${baseType} | Mapping[str, Any]`;
  }

  if (schema.kind === 'record') {
    return baseType.startsWith('dict[') ? `Mapping[${baseType.slice(5)}` : 'Mapping[str, Any]';
  }

  if (schema.kind === 'array') {
    if (schema.items.kind === 'primitive' && schema.items.type === 'string') {
      return baseType;
    }
    if (baseType.startsWith('list[') && baseType.endsWith(']')) {
      const inner = baseType.slice(5, -1);
      const widenedItem = widenPythonKwargAnnotation({ schema: schema.items, baseType: inner });
      return `Sequence[${widenedItem}]`;
    }
    return baseType;
  }

  if (schema.kind === 'union') {
    const nonNullVariants = schema.variants.filter((v) => !isNullIrSchema(v));
    if (
      nonNullVariants.length === 1 &&
      schema.variants.some(isNullIrSchema) &&
      baseType.endsWith(' | None')
    ) {
      const innerBase = baseType.slice(0, -' | None'.length);
      const widenedInner = widenPythonKwargAnnotation({
        schema: nonNullVariants[0]!,
        baseType: innerBase
      });
      return `${widenedInner} | None`;
    }
    if (schema.variants.some(schemaContainsObjectOrRecord)) {
      return baseType.includes('Mapping[str, Any]') ? baseType : `${baseType} | Mapping[str, Any]`;
    }
  }

  return baseType;
};

type CompiledModelsResult = {
  content: string;
  requestFieldMap: Map<string, RequestFieldMeta[]>;
};

const compilePythonModels = (ir: SdkIrDocument): CompiledModelsResult => {
  const dedupeMap = new Map<string, string>();
  const usedClassNames = new Set<string>();
  const definitions: string[] = [];
  const usedTypingNames = new Set<string>();
  const usedOptionsImports = new Set<string>();
  const usedPydanticImports = new Set<string>();
  const requestFieldMap: CompiledModelsResult['requestFieldMap'] = new Map();

  let usesBuiltins = false;

  // 先预占顶层所有请求/响应类名，防止嵌套匿名类偶然与后续顶层操作名碰撞。
  for (const op of ir.operations) {
    if (op.requestTypeName !== undefined) {
      usedClassNames.add(op.requestTypeName);
    }
    if (op.responseTypeName !== undefined) {
      usedClassNames.add(op.responseTypeName);
    }
  }

  for (const op of ir.operations) {
    if (op.requestTypeName !== undefined && op.requestSchema !== undefined) {
      const state: ModelEmitState = {
        direction: 'input',
        isOctetStreamInput: op.requestContentType === 'octet-stream',
        dedupeMap,
        usedClassNames,
        definitions,
        usedTypingNames,
        usedOptionsImports,
        usedPydanticImports,
        usesBuiltins
      };

      const buildFieldMetas = ({
        className,
        properties
      }: {
        className: string;
        properties: IrProperty[];
      }): RequestFieldMeta[] => {
        const usedNames = new Set<string>();
        return properties.map((prop) => {
          const pyName = allocatePythonFieldName({ rawName: prop.name, usedNames });
          const isNever = prop.schema.kind === 'never';
          const baseType = isNever
            ? 'None'
            : renderIrSchemaToPythonType({
                schema: prop.schema,
                hintName: `${className}${toPascalCase(prop.name) || 'Field'}`,
                state,
                isOctetField: state.isOctetStreamInput && prop.name === 'file'
              });
          return {
            rawName: prop.name,
            pyName,
            annotation: baseType,
            kwargAnnotation: isNever
              ? 'None'
              : widenPythonKwargAnnotation({ schema: prop.schema, baseType }),
            required: prop.required,
            isNever
          };
        });
      };

      const renderTopReq = (): void => {
        const schema = op.requestSchema!;
        const topName = op.requestTypeName!;

        if (schema.kind === 'object') {
          if (schema.properties.length === 0) {
            usedTypingNames.add('TypeAlias');
            usedTypingNames.add('Any');
            definitions.push(`${topName}: TypeAlias = dict[str, Any]`);
            requestFieldMap.set(topName, []);
            return;
          }

          emitObjectModelClass({
            className: topName,
            properties: schema.properties,
            description: `${op.summary} 请求参数（${op.httpMethod} ${op.path}）`,
            state
          });
          requestFieldMap.set(
            topName,
            buildFieldMetas({ className: topName, properties: schema.properties })
          );
          return;
        }

        // 顶层联合入参（例如 datasets.collections.delete / update）
        usedTypingNames.add('TypeAlias');
        const variantTypeNames: string[] = [];
        schema.variants.forEach((variant, idx) => {
          const variantName = reserveUniqueClassName({
            preferredName: `${topName}Variant${idx + 1}`,
            usedClassNames
          });
          emitObjectModelClass({
            className: variantName,
            properties: variant.properties,
            description: variant.description ?? `${op.summary} 请求分支 ${idx + 1}`,
            state
          });
          variantTypeNames.push(variantName);
          requestFieldMap.set(
            variantName,
            buildFieldMetas({ className: variantName, properties: variant.properties })
          );
        });
        definitions.push(`${topName}: TypeAlias = ${variantTypeNames.join(' | ')}`);
      };

      renderTopReq();
      usesBuiltins = state.usesBuiltins;
    }

    if (op.responseTypeName !== undefined && op.responseSchema !== undefined) {
      const state: ModelEmitState = {
        direction: 'output',
        isOctetStreamInput: false,
        dedupeMap,
        usedClassNames,
        definitions,
        usedTypingNames,
        usedOptionsImports,
        usedPydanticImports,
        usesBuiltins
      };

      const schema = op.responseSchema;
      const topName = op.responseTypeName;

      if (schema.kind === 'object' && schema.properties.length > 0) {
        emitObjectModelClass({
          className: topName,
          properties: schema.properties,
          description: `${op.summary} 响应数据（${op.httpMethod} ${op.path}）`,
          state
        });
      } else {
        usedTypingNames.add('TypeAlias');
        const aliasExpr = renderIrSchemaToPythonType({
          schema,
          hintName: topName,
          state,
          allowReuse: false
        });
        definitions.push(`${topName}: TypeAlias = ${aliasExpr}`);
      }

      usesBuiltins = state.usesBuiltins;
    }
  }

  // 组装严格排序且零冗余导入的 models.py 头部。
  const headerSections: string[] = [
    '# Auto-generated by @fastgpt-sdk/openapi-codegen. DO NOT EDIT MANUALLY.',
    '',
    'from __future__ import annotations'
  ];

  const stdImports: string[] = [];
  if (usesBuiltins) {
    stdImports.push('import builtins as _builtins');
  }
  if (usedTypingNames.has('Sequence')) {
    stdImports.push('from collections.abc import Sequence');
  }

  const typingList = [...usedTypingNames]
    .filter((name) => name !== 'Sequence')
    .sort(comparePythonImportNames);
  if (typingList.length > 0) {
    stdImports.push(`from typing import ${typingList.join(', ')}`);
  }
  if (stdImports.length > 0) {
    headerSections.push('', ...stdImports);
  }

  const pydanticList = [...usedPydanticImports].sort(comparePythonImportNames);
  if (pydanticList.length > 0) {
    headerSections.push('', `from pydantic import ${pydanticList.join(', ')}`);
  }

  const optionsList = [...usedOptionsImports].sort(comparePythonImportNames);
  if (optionsList.length > 0) {
    headerSections.push('', `from ..options import ${optionsList.join(', ')}`);
  }

  return {
    content: `${headerSections.join('\n')}\n\n\n${definitions.join('\n\n\n')}\n`,
    requestFieldMap
  };
};

const qualifyShadowedBuiltinsInAnnotation = ({
  typeExpr,
  shadowedBuiltins
}: {
  typeExpr: string;
  shadowedBuiltins: Set<string>;
}): { text: string; usedBuiltins: boolean } => {
  let usedBuiltins = false;
  const text = typeExpr.replace(
    /\b([A-Za-z_][A-Za-z0-9_]*)\b/g,
    (match, word: string, offset: number) => {
      if (!shadowedBuiltins.has(word)) return match;
      if (offset > 0 && typeExpr[offset - 1] === '.') return match;
      usedBuiltins = true;
      return `_builtins.${word}`;
    }
  );
  return { text, usedBuiltins };
};

/**
 * 生成 `sdk/python/src/fastgpt_sdk/generated/models.py` 源码字符串。
 */
export const emitPythonModelsFile = (ir: SdkIrDocument): string => compilePythonModels(ir).content;

/**
 * 生成 `sdk/python/src/fastgpt_sdk/generated/resources.py` 源码字符串。
 */
export const emitPythonResourcesFile = (ir: SdkIrDocument): string => {
  const { requestFieldMap } = compilePythonModels(ir);

  const importedModels = new Set<string>();
  const usedTypingNames = new Set<string>(['cast']);
  const usedOptionsImports = new Set<string>(['APIResponse', 'OperationSpec', 'RequestOptions']);
  let usesAnyRequestPayload = false;
  let usesAnyStream = false;
  let usesBuiltins = false;

  for (const op of ir.operations) {
    if (op.requestTypeName !== undefined) {
      importedModels.add(op.requestTypeName);
      usesAnyRequestPayload = true;
    }
    if (op.responseTypeName !== undefined) {
      importedModels.add(op.responseTypeName);
    }
    if (op.streamMethod !== undefined) {
      usesAnyStream = true;
    }
  }

  const collectTypeExprRefs = (typeExpr: string): void => {
    // 先剥离 Literal[...] 内的引号字面量，避免把枚举字符串（如 "all" / "api"）误识别为待导入符号。
    const stripped = typeExpr.replace(/"(?:\\.|[^"\\])*"/g, '');
    for (const token of stripped.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\b/g)) {
      const sym = token[1]!;
      if (SHADOWABLE_BUILTINS.has(sym) || sym === 'None') {
        continue;
      }
      if (sym === 'Any' || sym === 'Literal') {
        usedTypingNames.add(sym);
      } else if (sym === 'Mapping' || sym === 'Sequence') {
        usedTypingNames.add(sym);
      } else if (sym === 'Uploadable' || sym === 'BinaryInput') {
        usedOptionsImports.add(sym);
      } else {
        importedModels.add(sym);
      }
    }
  };

  if (usesAnyRequestPayload) {
    usedTypingNames.add('Any');
    usedTypingNames.add('Mapping');
    usedTypingNames.add('overload');
    usedOptionsImports.add('NOT_GIVEN');
    usedOptionsImports.add('NotGiven');
  }

  for (const op of ir.operations) {
    if (op.requestTypeName === undefined || op.requestSchema === undefined) continue;
    if (op.requestSchema.kind === 'object') {
      const fields = requestFieldMap.get(op.requestTypeName) ?? [];
      for (const f of fields) {
        if (!f.isNever) collectTypeExprRefs(f.kwargAnnotation);
      }
    } else {
      op.requestSchema.variants.forEach((_variant, idx) => {
        const variantName = `${op.requestTypeName}Variant${idx + 1}`;
        const fields = requestFieldMap.get(variantName) ?? [];
        for (const f of fields) {
          if (!f.isNever) collectTypeExprRefs(f.kwargAnnotation);
        }
      });
    }
  }

  // 1. 生成每个操作的静态 OperationSpec 元数据常量
  const specBlocks: string[] = ir.operations.map((op) => {
    const constName = toSpecConstName(op.id);
    const fields = [
      `    id=${toPythonStringLiteral(op.id)},`,
      `    http_method=${toPythonStringLiteral(op.httpMethod)},`,
      `    path=${toPythonStringLiteral(op.path)},`,
      `    request_content_type=${toPythonStringLiteral(op.requestContentType)},`,
      ...(op.multipartMode !== undefined
        ? [`    multipart_mode=${toPythonStringLiteral(op.multipartMode)},`]
        : []),
      `    response_mode=${toPythonStringLiteral(op.responseMode)},`,
      `    app_id_carrier=${op.appIdCarrier !== null ? toPythonStringLiteral(op.appIdCarrier) : 'None'},`,
      `    identity_carrier=${op.identityCarrier !== null ? toPythonStringLiteral(op.identityCarrier) : 'None'},`,
      `    path_params=${formatPythonTuple(op.pathParams)},`,
      `    query_params=${formatPythonTuple(op.queryParams)},`,
      `    body_params=${formatPythonTuple(op.bodyParams)},`,
      ...(op.binaryBodyField !== undefined
        ? [`    binary_body_field=${toPythonStringLiteral(op.binaryBodyField)},`]
        : []),
      ...(op.retryable !== undefined ? [`    retryable=${op.retryable ? 'True' : 'False'},`] : [])
    ];
    return `${constName} = OperationSpec(\n${fields.join('\n')}\n)`;
  });

  // 2. 统一方法体渲染器（覆盖 Sync / Async 与 Normal / WithRawResponse 四种变体）
  const renderOperationMethods = ({
    op,
    isAsync,
    isRawResponse,
    shadowedBuiltins
  }: {
    op: IrOperation;
    isAsync: boolean;
    isRawResponse: boolean;
    shadowedBuiltins: Set<string>;
  }): string => {
    const specConst = toSpecConstName(op.id);
    const pyMethod = toPythonSnakeCase(op.method);
    const asyncPrefix = isAsync ? 'async ' : '';
    const awaitPrefix = isAsync ? 'await ' : '';
    const innerResType = op.responseTypeName ?? 'None';
    const resType = isRawResponse ? `APIResponse[${innerResType}]` : innerResType;
    const responseTypeExpr = op.responseTypeName ?? 'None';
    const isDualMode = op.streamMethod !== undefined && op.requestContentType === 'json';

    const docText = formatPythonDocstring({
      lines: [op.summary, op.description !== undefined ? op.description.split('\n')[0] : undefined],
      indent: '        '
    });

    const qualifyAnn = (rawAnn: string): string => {
      if (shadowedBuiltins.size === 0) return rawAnn;
      const res = qualifyShadowedBuiltinsInAnnotation({ typeExpr: rawAnn, shadowedBuiltins });
      if (res.usedBuiltins) usesBuiltins = true;
      return res.text;
    };

    const renderNoInputMethod = (): string => {
      const callMethod = isRawResponse ? '_request_raw' : '_request';
      const isVoidDirect = !isRawResponse && op.responseTypeName === undefined;
      const callExpr = `${awaitPrefix}self._client.${callMethod}(`;
      const callBlock = [
        isVoidDirect
          ? `        ${callExpr}`
          : `        return cast(\n            ${resType},\n            ${callExpr}`,
        `            spec=${specConst},`,
        '            request_type=None,',
        `            response_type=${responseTypeExpr},`,
        '            request_options=request_options,',
        ...(isVoidDirect ? ['        )', '        return None'] : ['            ),', '        )'])
      ];
      return [
        `    ${asyncPrefix}def ${pyMethod}(`,
        '        self,',
        '        *,',
        '        request_options: RequestOptions | None = None,',
        `    ) -> ${resType}:`,
        ...(docText.length > 0 ? [docText.trimEnd()] : []),
        ...callBlock
      ].join('\n');
    };

    const renderWithInputMethod = (): string => {
      const reqType = op.requestTypeName!;
      const requestSchema = op.requestSchema!;

      const overloadBlocks: string[] = [];

      // 重载 1：接收完整强类型请求模型或原始 Mapping（位置参数）
      overloadBlocks.push(
        [
          '    @overload',
          `    ${asyncPrefix}def ${pyMethod}(`,
          '        self,',
          `        request: ${reqType} | Mapping[str, Any],`,
          '        /,',
          '        *,',
          '        request_options: RequestOptions | None = None,',
          `    ) -> ${resType}:`,
          '        ...'
        ].join('\n')
      );

      // 重载 2..N：按 IR 对象（或互斥联合各分支）展开惯用 snake_case 关键字参数
      const appendKeywordOverload = (variantKey: string): void => {
        const fields = (requestFieldMap.get(variantKey) ?? []).filter((f) => !f.isNever);
        const requiredFields = fields.filter((f) => f.required);
        const optionalFields = fields.filter((f) => !f.required);

        const paramLines: string[] = ['        self,', '        /,', '        *,'];
        for (const f of requiredFields) {
          paramLines.push(`        ${f.pyName}: ${qualifyAnn(f.kwargAnnotation)},`);
        }
        for (const f of optionalFields) {
          paramLines.push(
            `        ${f.pyName}: ${qualifyAnn(f.kwargAnnotation)} | NotGiven = NOT_GIVEN,`
          );
        }
        paramLines.push('        request_options: RequestOptions | None = None,');

        overloadBlocks.push(
          [
            '    @overload',
            `    ${asyncPrefix}def ${pyMethod}(`,
            ...paramLines,
            `    ) -> ${resType}:`,
            '        ...'
          ].join('\n')
        );
      };

      if (requestSchema.kind === 'object') {
        appendKeywordOverload(reqType);
      } else {
        requestSchema.variants.forEach((_v, idx) => {
          appendKeywordOverload(`${reqType}Variant${idx + 1}`);
        });
      }

      const callMethod = isRawResponse ? '_request_raw' : '_request';
      const isVoidDirect = !isRawResponse && op.responseTypeName === undefined;
      const callExpr = `${awaitPrefix}self._client.${callMethod}(`;
      const indent = isVoidDirect ? '        ' : '            ';
      const implLines = [
        `    ${asyncPrefix}def ${pyMethod}(`,
        '        self,',
        `        request: ${reqType} | Mapping[str, Any] | None = None,`,
        '        /,',
        '        *,',
        '        request_options: RequestOptions | None = None,',
        '        **kwargs: Any,',
        `    ) -> ${resType}:`,
        ...(docText.length > 0 ? [docText.trimEnd()] : []),
        isVoidDirect
          ? `        ${callExpr}`
          : `        return cast(\n            ${resType},\n            ${callExpr}`,
        `${indent}spec=${specConst},`,
        `${indent}request_type=${reqType},`,
        `${indent}response_type=${responseTypeExpr},`,
        `${indent}request=request,`,
        `${indent}kwargs=kwargs,`,
        ...(isDualMode ? [`${indent}fixed_fields={"stream": False},`] : []),
        `${indent}request_options=request_options,`,
        ...(isVoidDirect ? ['        )', '        return None'] : ['        ),', '        )'])
      ].join('\n');

      return `${overloadBlocks.join('\n\n')}\n\n${implLines}`;
    };

    const mainMethodCode =
      op.requestTypeName === undefined ? renderNoInputMethod() : renderWithInputMethod();

    if (isRawResponse || op.streamMethod === undefined) {
      return mainMethodCode;
    }

    // 生成双模态 SSE 流式方法（如 completions_v2_stream）
    const pyStreamMethod = toPythonSnakeCase(op.streamMethod);
    const streamReturnType = isAsync ? 'AsyncChatStream' : 'ChatStream';
    const streamDoc = formatPythonDocstring({
      lines: [`${op.summary}（SSE 流式事件响应）`],
      indent: '        '
    });

    if (op.requestTypeName === undefined) {
      return [
        mainMethodCode,
        [
          `    ${asyncPrefix}def ${pyStreamMethod}(`,
          '        self,',
          '        *,',
          '        request_options: RequestOptions | None = None,',
          `    ) -> ${streamReturnType}:`,
          ...(streamDoc.length > 0 ? [streamDoc.trimEnd()] : []),
          `        return ${awaitPrefix}self._client._request_stream(`,
          `            spec=${specConst},`,
          '            request_type=None,',
          '            request_options=request_options,',
          '        )'
        ].join('\n')
      ].join('\n\n');
    }

    const reqType = op.requestTypeName;
    const fields = (requestFieldMap.get(reqType) ?? []).filter((f) => !f.isNever);
    const requiredFields = fields.filter((f) => f.required);
    const optionalFields = fields.filter((f) => !f.required);
    const kwParamLines: string[] = ['        self,', '        /,', '        *,'];
    for (const f of requiredFields) {
      kwParamLines.push(`        ${f.pyName}: ${qualifyAnn(f.kwargAnnotation)},`);
    }
    for (const f of optionalFields) {
      kwParamLines.push(
        `        ${f.pyName}: ${qualifyAnn(f.kwargAnnotation)} | NotGiven = NOT_GIVEN,`
      );
    }
    kwParamLines.push('        request_options: RequestOptions | None = None,');

    const streamMethodBlock = [
      '    @overload',
      `    ${asyncPrefix}def ${pyStreamMethod}(`,
      '        self,',
      `        request: ${reqType} | Mapping[str, Any],`,
      '        /,',
      '        *,',
      '        request_options: RequestOptions | None = None,',
      `    ) -> ${streamReturnType}:`,
      '        ...',
      '',
      '    @overload',
      `    ${asyncPrefix}def ${pyStreamMethod}(`,
      ...kwParamLines,
      `    ) -> ${streamReturnType}:`,
      '        ...',
      '',
      `    ${asyncPrefix}def ${pyStreamMethod}(`,
      '        self,',
      `        request: ${reqType} | Mapping[str, Any] | None = None,`,
      '        /,',
      '        *,',
      '        request_options: RequestOptions | None = None,',
      '        **kwargs: Any,',
      `    ) -> ${streamReturnType}:`,
      ...(streamDoc.length > 0 ? [streamDoc.trimEnd()] : []),
      `        return ${awaitPrefix}self._client._request_stream(`,
      `            spec=${specConst},`,
      `            request_type=${reqType},`,
      '            request=request,',
      '            kwargs=kwargs,',
      ...(isDualMode ? ['            fixed_fields={"stream": True},'] : []),
      '            request_options=request_options,',
      '        )'
    ].join('\n');

    return `${mainMethodCode}\n\n${streamMethodBlock}`;
  };

  // 3. 自底向上渲染四大 Resource 树（Sync / SyncWithRawResponse / Async / AsyncWithRawResponse）
  const classBlocks: string[] = [];

  const emitVariantTree = ({
    node,
    isAsync,
    isRawResponse
  }: {
    node: IrResourceNode;
    isAsync: boolean;
    isRawResponse: boolean;
  }): void => {
    for (const child of node.children) {
      emitVariantTree({ node: child, isAsync, isRawResponse });
    }

    const prefix = `${isAsync ? 'Async' : ''}${isRawResponse ? 'WithRawResponse' : ''}`;
    const className = toResourceClassName({ fullPath: node.fullPath, prefix });
    const clientClass = isAsync ? 'AsyncBaseClient' : 'SyncBaseClient';

    // 检查当前 Resource 类体内定义的方法名是否与 Python 内置类型重名（如 def list），避免同类后续方法注解触发 mypy 遮蔽。
    const shadowedBuiltins = new Set<string>();
    for (const op of node.operations) {
      const m = toPythonSnakeCase(op.method);
      if (SHADOWABLE_BUILTINS.has(m)) {
        shadowedBuiltins.add(m);
      }
      if (op.streamMethod !== undefined) {
        const sm = toPythonSnakeCase(op.streamMethod);
        if (SHADOWABLE_BUILTINS.has(sm)) {
          shadowedBuiltins.add(sm);
        }
      }
    }

    const lines: string[] = [
      `class ${className}:`,
      `    def __init__(self, client: ${clientClass}) -> None:`,
      '        self._client = client'
    ];
    for (const child of node.children) {
      const childAttr = toPythonSnakeCase(child.name);
      const childClass = toResourceClassName({ fullPath: child.fullPath, prefix });
      lines.push(`        self.${childAttr} = ${childClass}(client)`);
    }

    for (const op of node.operations) {
      lines.push('');
      lines.push(renderOperationMethods({ op, isAsync, isRawResponse, shadowedBuiltins }));
    }

    classBlocks.push(lines.join('\n'));
  };

  const variants: Array<{ isAsync: boolean; isRawResponse: boolean }> = [
    { isAsync: false, isRawResponse: false },
    { isAsync: false, isRawResponse: true },
    { isAsync: true, isRawResponse: false },
    { isAsync: true, isRawResponse: true }
  ];

  for (const variant of variants) {
    for (const rootNode of ir.resources) {
      emitVariantTree({ node: rootNode, ...variant });
    }
  }

  // 4. 组装严格遵循 isort 顺序的导入头
  const headerLines: string[] = [
    '# Auto-generated by @fastgpt-sdk/openapi-codegen. DO NOT EDIT MANUALLY.',
    '',
    'from __future__ import annotations'
  ];

  const collectionsImports: string[] = [];
  if (usedTypingNames.has('Mapping')) collectionsImports.push('Mapping');
  if (usedTypingNames.has('Sequence')) collectionsImports.push('Sequence');
  collectionsImports.sort(comparePythonImportNames);

  const typingImports = [...usedTypingNames]
    .filter((name) => name !== 'Mapping' && name !== 'Sequence')
    .concat(['TYPE_CHECKING'])
    .sort(comparePythonImportNames);

  const stdImports: string[] = [];
  if (usesBuiltins) {
    stdImports.push('import builtins as _builtins');
  }
  if (collectionsImports.length > 0) {
    stdImports.push(`from collections.abc import ${collectionsImports.join(', ')}`);
  }
  stdImports.push(`from typing import ${typingImports.join(', ')}`);

  headerLines.push('', ...stdImports);

  const optionsList = [...usedOptionsImports].sort(comparePythonImportNames);
  headerLines.push('', `from ..options import ${optionsList.join(', ')}`);

  if (usesAnyStream) {
    headerLines.push('from ..sse import AsyncChatStream, ChatStream');
  }

  const modelImportList = [...importedModels].sort(comparePythonImportNames);
  if (modelImportList.length > 0) {
    headerLines.push(
      'from .models import (',
      ...modelImportList.map((name) => `    ${name},`),
      ')'
    );
  }

  headerLines.push(
    '',
    'if TYPE_CHECKING:',
    '    from .._base_client import AsyncBaseClient, SyncBaseClient'
  );

  return `${[headerLines.join('\n'), specBlocks.join('\n\n'), classBlocks.join('\n\n')].join('\n\n\n')}\n`;
};
