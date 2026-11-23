import type { IrOperation, IrProperty, IrResourceNode, IrSchema, SdkIrDocument } from './irTypes';

const VALID_IDENTIFIER_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

const sanitizeDocText = (text: string): string => text.replace(/\*\//g, '*\\/').trim();

const formatJsDoc = ({
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
    .flatMap((line) => sanitizeDocText(line).split('\n'));

  if (deprecated) {
    cleaned.push('@deprecated');
  }
  if (cleaned.length === 0) {
    return '';
  }
  if (cleaned.length === 1) {
    return `${indent}/** ${cleaned[0]} */\n`;
  }
  const body = cleaned
    .map((line) => (line.length > 0 ? `${indent} * ${line}` : `${indent} *`))
    .join('\n');
  return `${indent}/**\n${body}\n${indent} */\n`;
};

const formatPropertyKey = (name: string): string =>
  VALID_IDENTIFIER_RE.test(name) ? name : JSON.stringify(name);

const capitalize = (word: string): string =>
  word.length === 0 ? '' : `${word[0]!.toUpperCase()}${word.slice(1)}`;

const toResourceClassName = (fullPath: string): string =>
  `${fullPath.split('.').map(capitalize).join('')}Resource`;

const toSpecConstName = (operationId: string): string =>
  `${operationId
    .replace(/\./g, '_')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toUpperCase()}_SPEC`;

/**
 * 将 IrSchema 渲染为符合仓库规范的 TypeScript 类型表达式（仅使用 type / Record / Array，不使用 interface）。
 */
export const renderTsType = ({
  schema,
  direction,
  isOctetStreamInput = false,
  indent = ''
}: {
  schema: IrSchema;
  direction: 'input' | 'output';
  isOctetStreamInput?: boolean;
  indent?: string;
}): string => {
  switch (schema.kind) {
    case 'primitive': {
      if (schema.type === 'integer' || schema.type === 'number') return 'number';
      return schema.type;
    }
    case 'literal':
      return JSON.stringify(schema.value);
    case 'enum':
      return schema.values.map((v) => JSON.stringify(v)).join(' | ');
    case 'binary': {
      if (direction === 'output') return 'ArrayBuffer';
      if (isOctetStreamInput) return 'BinaryInput';
      return schema.multiple === true ? 'Uploadable | Uploadable[]' : 'Uploadable';
    }
    case 'never':
      return 'never';
    case 'unknown':
      return 'unknown';
    case 'array': {
      const itemTs = renderTsType({
        schema: schema.items,
        direction,
        indent
      });
      const isSimple = /^[A-Za-z0-9_]+$/.test(itemTs);
      return isSimple ? `${itemTs}[]` : `Array<${itemTs}>`;
    }
    case 'tuple': {
      const items = schema.items.map((item) => renderTsType({ schema: item, direction, indent }));
      return `[${items.join(', ')}]`;
    }
    case 'record': {
      const valTs = renderTsType({
        schema: schema.valueType,
        direction,
        indent
      });
      return `Record<string, ${valTs}>`;
    }
    case 'union': {
      if (indent === '' && schema.variants.every((v) => v.kind === 'object')) {
        return `\n${schema.variants
          .map(
            (variant) =>
              `  | ${renderTsType({
                schema: variant,
                direction,
                isOctetStreamInput,
                indent: '  '
              })}`
          )
          .join('\n')}`;
      }
      return schema.variants
        .map((variant) => renderTsType({ schema: variant, direction, isOctetStreamInput, indent }))
        .join(' | ');
    }
    case 'object': {
      return renderTsObjectLiteral({
        properties: schema.properties,
        additionalProperties: schema.additionalProperties,
        direction,
        isOctetStreamInput,
        indent
      });
    }
  }
};

const renderTsObjectLiteral = ({
  properties,
  additionalProperties,
  direction,
  isOctetStreamInput = false,
  indent = ''
}: {
  properties: IrProperty[];
  additionalProperties?: boolean | IrSchema;
  direction: 'input' | 'output';
  isOctetStreamInput?: boolean;
  indent?: string;
}): string => {
  if (
    properties.length === 0 &&
    (additionalProperties === undefined || additionalProperties === false)
  ) {
    return 'Record<string, never>';
  }
  if (properties.length === 0 && additionalProperties === true) {
    return 'Record<string, unknown>';
  }
  if (
    properties.length === 0 &&
    additionalProperties !== undefined &&
    typeof additionalProperties === 'object'
  ) {
    const extraTs = renderTsType({ schema: additionalProperties, direction, indent });
    return `Record<string, ${extraTs}>`;
  }

  const nextIndent = `${indent}  `;
  const lines: string[] = ['{'];

  for (const prop of properties) {
    const doc = formatJsDoc({
      lines: [prop.description],
      deprecated: prop.deprecated === true,
      indent: nextIndent
    });
    if (doc.length > 0) {
      lines.push(doc.trimEnd());
    }
    const propType = renderTsType({
      schema: prop.schema,
      direction,
      isOctetStreamInput: isOctetStreamInput && prop.name === 'file',
      indent: nextIndent
    });
    const optMark = prop.required ? '' : '?';
    lines.push(`${nextIndent}${formatPropertyKey(prop.name)}${optMark}: ${propType};`);
  }

  if (additionalProperties === true) {
    lines.push(`${nextIndent}[key: string]: unknown;`);
  } else if (additionalProperties !== undefined && typeof additionalProperties === 'object') {
    const extraTs = renderTsType({
      schema: additionalProperties,
      direction,
      indent: nextIndent
    });
    lines.push(`${nextIndent}[key: string]: ${extraTs} | undefined;`);
  }

  lines.push(`${indent}}`);
  return lines.join('\n');
};

const schemaUsesBinaryType = (
  schema: IrSchema | undefined,
  mode: 'uploadable' | 'octet'
): boolean => {
  if (schema === undefined) return false;
  switch (schema.kind) {
    case 'binary':
      return true;
    case 'array':
      return schemaUsesBinaryType(schema.items, mode);
    case 'tuple':
      return schema.items.some((item) => schemaUsesBinaryType(item, mode));
    case 'record':
      return schemaUsesBinaryType(schema.valueType, mode);
    case 'union':
      return schema.variants.some((v) => schemaUsesBinaryType(v, mode));
    case 'object':
      return schema.properties.some((p) =>
        mode === 'octet'
          ? p.name === 'file' && p.schema.kind === 'binary'
          : p.schema.kind === 'binary' || schemaUsesBinaryType(p.schema, mode)
      );
    default:
      return false;
  }
};

/**
 * 生成 sdk/client/src/generated/types.ts 源码字符串。
 */
export const emitTypeScriptTypesFile = (ir: SdkIrDocument): string => {
  let needsUploadable = false;
  let needsBinaryInput = false;

  for (const op of ir.operations) {
    if (op.requestSchema === undefined) continue;
    if (op.requestContentType === 'octet-stream') {
      if (schemaUsesBinaryType(op.requestSchema, 'octet')) {
        needsBinaryInput = true;
      }
    } else if (schemaUsesBinaryType(op.requestSchema, 'uploadable')) {
      needsUploadable = true;
    }
  }

  const coreTypeImports: string[] = [];
  if (needsBinaryInput) coreTypeImports.push('BinaryInput');
  if (needsUploadable) coreTypeImports.push('Uploadable');

  const blocks: string[] = [
    '/* Auto-generated by @fastgpt-sdk/openapi-codegen. DO NOT EDIT MANUALLY. */'
  ];

  if (coreTypeImports.length > 0) {
    blocks.push(`import type { ${coreTypeImports.join(', ')} } from '../core/types';`);
  }

  for (const op of ir.operations) {
    if (op.requestTypeName !== undefined && op.requestSchema !== undefined) {
      const reqDoc = formatJsDoc({
        lines: [`${op.summary} 请求参数（${op.httpMethod} ${op.path}）`]
      });
      const reqTs = renderTsType({
        schema: op.requestSchema,
        direction: 'input',
        isOctetStreamInput: op.requestContentType === 'octet-stream'
      });
      blocks.push(`${reqDoc}export type ${op.requestTypeName} = ${reqTs};`);
    }

    if (op.responseTypeName !== undefined && op.responseSchema !== undefined) {
      const resDoc = formatJsDoc({
        lines: [`${op.summary} 响应数据（${op.httpMethod} ${op.path}）`]
      });
      const resTs = renderTsType({
        schema: op.responseSchema,
        direction: 'output'
      });
      blocks.push(`${resDoc}export type ${op.responseTypeName} = ${resTs};`);
    }
  }

  return `${blocks.join('\n\n')}\n`;
};

/**
 * 生成 sdk/client/src/generated/resources.ts 源码字符串。
 */
export const emitTypeScriptResourcesFile = (ir: SdkIrDocument): string => {
  const importedTypeNames = new Set<string>();
  let usesChatStream = false;

  for (const op of ir.operations) {
    if (op.requestTypeName !== undefined) importedTypeNames.add(op.requestTypeName);
    if (op.responseTypeName !== undefined) importedTypeNames.add(op.responseTypeName);
    if (op.streamMethod !== undefined) usesChatStream = true;
  }

  const sortedTypeImports = [...importedTypeNames].sort();

  const headerLines: string[] = [
    '/* Auto-generated by @fastgpt-sdk/openapi-codegen. DO NOT EDIT MANUALLY. */',
    "import type { ApiPromise } from '../core/apiPromise';",
    "import type { BaseClient } from '../core/baseClient';"
  ];
  if (usesChatStream) {
    headerLines.push("import type { ChatStream } from '../core/sse';");
  }
  headerLines.push("import type { OperationSpec, RequestOptions } from '../core/types';");
  if (sortedTypeImports.length > 0) {
    headerLines.push(`import type {\n  ${sortedTypeImports.join(',\n  ')}\n} from './types';`);
  }

  // 1. 生成每个操作的静态元数据常量（避免每次调用重新分配对象）
  const specConsts: string[] = ir.operations.map((op) => {
    const constName = toSpecConstName(op.id);
    const specObj = {
      id: op.id,
      httpMethod: op.httpMethod,
      path: op.path,
      requestContentType: op.requestContentType,
      ...(op.multipartMode !== undefined ? { multipartMode: op.multipartMode } : {}),
      responseMode: op.responseMode,
      appIdCarrier: op.appIdCarrier,
      identityCarrier: op.identityCarrier,
      pathParams: op.pathParams,
      queryParams: op.queryParams,
      bodyParams: op.bodyParams,
      ...(op.binaryBodyField !== undefined ? { binaryBodyField: op.binaryBodyField } : {})
    };
    return `const ${constName}: OperationSpec = ${JSON.stringify(specObj, null, 2)};`;
  });

  // 2. 自底向上生成所有领域 Resource 类（子资源先声明，供父资源属性直接实例化挂载）
  const classBlocks: string[] = [];

  const emitNode = (node: IrResourceNode): void => {
    for (const child of node.children) {
      emitNode(child);
    }

    const className = toResourceClassName(node.fullPath);
    const lines: string[] = [`export class ${className} {`];
    lines.push('  private readonly _client: BaseClient;');

    for (const child of node.children) {
      lines.push(`  readonly ${child.name}: ${toResourceClassName(child.fullPath)};`);
    }

    lines.push('');
    lines.push('  constructor(client: BaseClient) {');
    lines.push('    this._client = client;');
    for (const child of node.children) {
      lines.push(`    this.${child.name} = new ${toResourceClassName(child.fullPath)}(client);`);
    }
    lines.push('  }');

    for (const op of node.operations) {
      lines.push('');
      lines.push(renderResourceMethods(op));
    }

    lines.push('}');
    classBlocks.push(lines.join('\n'));
  };

  for (const rootNode of ir.resources) {
    emitNode(rootNode);
  }

  // 3. 生成供顶层 FastGPT Client 组合挂载的工厂函数与聚合类型
  const rootPropsType = ir.resources
    .map((r) => `  readonly ${r.name}: ${toResourceClassName(r.fullPath)};`)
    .join('\n');
  const rootPropsInit = ir.resources
    .map((r) => `  ${r.name}: new ${toResourceClassName(r.fullPath)}(client)`)
    .join(',\n');

  const factoryBlock = [
    `export type GeneratedResources = {\n${rootPropsType}\n};`,
    `export const createGeneratedResources = (client: BaseClient): GeneratedResources => ({\n${rootPropsInit}\n});`
  ].join('\n\n');

  return `${[headerLines.join('\n'), specConsts.join('\n\n'), classBlocks.join('\n\n'), factoryBlock].join('\n\n')}\n`;
};

const renderResourceMethods = (op: IrOperation): string => {
  const constName = toSpecConstName(op.id);
  const resType = op.responseTypeName ?? 'void';
  const doc = formatJsDoc({
    lines: [op.summary, op.description ? op.description.split('\n')[0] : undefined],
    indent: '  '
  });

  const isCompletionDualMode = op.streamMethod !== undefined && op.requestContentType === 'json';

  const mainMethod = (() => {
    if (op.requestTypeName === undefined) {
      return [
        `${doc}  ${op.method}(options?: RequestOptions): ApiPromise<${resType}> {`,
        `    return this._client._request<${resType}>({ spec: ${constName}, requestOptions: options });`,
        '  }'
      ].join('\n');
    }

    const reqParam = op.hasRequiredInput
      ? `req: ${op.requestTypeName}`
      : `req?: ${op.requestTypeName}`;
    const payloadExpr = isCompletionDualMode
      ? '{ ...(req ?? {}), stream: false }'
      : 'req as Record<string, unknown> | undefined';

    return [
      `${doc}  ${op.method}(${reqParam}, options?: RequestOptions): ApiPromise<${resType}> {`,
      `    return this._client._request<${resType}>({ spec: ${constName}, rawInput: ${payloadExpr}, requestOptions: options });`,
      '  }'
    ].join('\n');
  })();

  if (op.streamMethod === undefined) {
    return mainMethod;
  }

  const streamDoc = formatJsDoc({
    lines: [`${op.summary}（SSE 流式事件响应）`],
    indent: '  '
  });

  const streamReqParam =
    op.requestTypeName === undefined
      ? ''
      : op.hasRequiredInput
        ? `req: ${op.requestTypeName}, `
        : `req?: ${op.requestTypeName}, `;

  const streamPayloadPart =
    op.requestTypeName === undefined
      ? ''
      : isCompletionDualMode
        ? ', rawInput: { ...(req ?? {}), stream: true }'
        : ', rawInput: req as Record<string, unknown> | undefined';

  const streamMethodCode = [
    `${streamDoc}  ${op.streamMethod}(${streamReqParam}options?: RequestOptions): Promise<ChatStream> {`,
    `    return this._client._requestStream({ spec: ${constName}${streamPayloadPart}, requestOptions: options });`,
    '  }'
  ].join('\n');

  return `${mainMethod}\n\n${streamMethodCode}`;
};
