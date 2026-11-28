import { getNanoid } from '../../../../common/string/tools';
import { type PathDataType, type HttpToolConfigType } from './type';
import { type RuntimeNodeItemType } from '../../../workflow/runtime/type';
import { FlowNodeOutputTypeEnum, FlowNodeTypeEnum } from '../../../workflow/node/constant';
import { AppToolSourceEnum } from '../constants';
import {
  getNodeInputTypeFromSchemaInputType,
  jsonSchema2NodeInput,
  jsonSchema2NodeOutput
} from '../../jsonschema';
import { type StoreSecretValueType } from '../../../../common/secret/type';
import { type JSONSchemaInputType, type JsonSchemaPropertiesItemType } from '../../jsonschema';
import {
  NodeOutputKeyEnum,
  WorkflowIOValueTypeEnum,
  valueTypeJsonSchemaMap
} from '../../../workflow/constants';
import { i18nT } from '../../../../common/i18n/utils';
import type { NodeToolConfigType } from '../../../workflow/type/node';

const legacyManualHttpToolArrayTypes = new Set<string>([
  WorkflowIOValueTypeEnum.arrayString,
  WorkflowIOValueTypeEnum.arrayNumber,
  WorkflowIOValueTypeEnum.arrayBoolean
]);

/** 判断 JSON Schema type 是否为手工 HTTP 工具历史上写入的数组值类型。 */
export const isLegacyManualHttpToolArrayType = (
  value: unknown
): value is
  | WorkflowIOValueTypeEnum.arrayString
  | WorkflowIOValueTypeEnum.arrayNumber
  | WorkflowIOValueTypeEnum.arrayBoolean =>
  typeof value === 'string' && legacyManualHttpToolArrayTypes.has(value);

/** 将手工 HTTP 工具编辑器的工作流值类型转换为标准 JSON Schema property。 */
export const manualHttpToolValueType2JsonSchema = (
  valueType: WorkflowIOValueTypeEnum
): JsonSchemaPropertiesItemType => {
  const schema =
    valueTypeJsonSchemaMap[valueType] ?? valueTypeJsonSchemaMap[WorkflowIOValueTypeEnum.string];

  return {
    ...schema,
    ...(schema.items && typeof schema.items === 'object' ? { items: { ...schema.items } } : {})
  };
};

/** 将标准或历史 HTTP 工具 property Schema 还原为手工编辑器使用的工作流值类型。 */
export const jsonSchemaProperty2ManualHttpToolValueType = (
  schema: JsonSchemaPropertiesItemType
): WorkflowIOValueTypeEnum => {
  if (isLegacyManualHttpToolArrayType(schema.type)) {
    return schema.type;
  }

  return getNodeInputTypeFromSchemaInputType({
    type: typeof schema.type === 'string' ? schema.type : undefined,
    arrayItems: schema.items,
    schema
  });
};

/** Read the explicit HTTP input mode, falling back to the legacy description marker. */
export const isHttpToolInputAgentGenerated = (
  property: Pick<JsonSchemaPropertiesItemType, 'isToolParam' | 'x-tool-description'>
): boolean => property.isToolParam ?? Boolean(property['x-tool-description']);

/** Persist the HTTP input mode while retaining the legacy description marker. */
export const updateHttpToolInputProperty = ({
  key,
  property,
  enabled
}: {
  key: string;
  property: JsonSchemaPropertiesItemType;
  enabled: boolean;
}): JsonSchemaPropertiesItemType => ({
  ...property,
  'x-tool-description': enabled ? property.description || key : '',
  isToolParam: enabled
});

export const getHTTPToolSetRuntimeNode = ({
  name,
  avatar,
  baseUrl,
  customHeaders,
  apiSchemaStr,
  toolList = [],
  headerSecret
}: {
  name?: string;
  avatar?: string;
  baseUrl?: string;
  customHeaders?: string;
  apiSchemaStr?: string;
  toolList?: HttpToolConfigType[];
  headerSecret?: StoreSecretValueType;
}): RuntimeNodeItemType => {
  return {
    nodeId: getNanoid(16),
    flowNodeType: FlowNodeTypeEnum.toolSet,
    avatar,
    intro: 'HTTP Tools',
    toolConfig: {
      httpToolSet: {
        toolList,
        ...(baseUrl !== undefined && { baseUrl }),
        ...(apiSchemaStr !== undefined && { apiSchemaStr }),
        ...(customHeaders !== undefined && { customHeaders }),
        ...(headerSecret !== undefined && { headerSecret })
      }
    },
    inputs: [],
    outputs: [],
    name: name || '',
    version: ''
  };
};

export const getHTTPToolRuntimeNode = ({
  tool,
  nodeId,
  avatar = 'core/app/type/httpToolsFill',
  toolSetId,
  toolsetName
}: {
  tool: Omit<HttpToolConfigType, 'path' | 'method' | 'headerSecret'>;
  nodeId: string;
  avatar?: string;
  toolSetId: string;
  toolsetName: string;
}): RuntimeNodeItemType => {
  const { inputSchema, requestSchema } = getHTTPToolRuntimeSchemas(tool);
  const inputs = jsonSchema2NodeInput({
    jsonSchema: inputSchema,
    schemaType: 'http'
  }).map((input) => ({
    ...input,
    // 兼容旧 HTTP 工具 schema；空 x-tool-description 表示开发者手动配置。
    defaultToAgentGenerated: input.defaultToAgentGenerated ?? Boolean(input.toolDescription)
  }));

  return {
    nodeId,
    flowNodeType: FlowNodeTypeEnum.tool,
    avatar,
    intro: tool.description,
    toolConfig: {
      httpTool: {
        toolId: `${AppToolSourceEnum.http}-${toolSetId}/${tool.name}`
      }
    },
    jsonSchema: requestSchema,
    inputs,
    outputs: [
      ...jsonSchema2NodeOutput({ jsonSchema: tool.outputSchema }),
      {
        id: NodeOutputKeyEnum.rawResponse,
        key: NodeOutputKeyEnum.rawResponse,
        required: true,
        label: i18nT('workflow:raw_response'),
        description: i18nT('workflow:tool_raw_response_description'),
        valueType: WorkflowIOValueTypeEnum.any,
        type: FlowNodeOutputTypeEnum.static
      }
    ],
    name: `${toolsetName}/${tool.name}`,
    version: ''
  };
};

/**
 * 在 runtime builder 入口一次性补齐 HTTP 请求 schema 和表单 schema。
 * 旧版 GET 工具可能把单个参数 schema 写进 requestSchema，运行时回退到 inputSchema。
 */
export const getHTTPToolRuntimeSchemas = ({
  requestSchema,
  inputSchema
}: Pick<HttpToolConfigType, 'requestSchema' | 'inputSchema'>) => {
  const hasRequestProperties =
    !!requestSchema?.properties && Object.keys(requestSchema.properties).length > 0;
  const currentRequestSchema = hasRequestProperties
    ? requestSchema
    : (inputSchema ?? requestSchema);
  const hasInputProperties =
    !!inputSchema?.properties && Object.keys(inputSchema.properties).length > 0;

  return {
    // 有效 requestSchema 是执行契约，不能把展示用 inputSchema 的字段或必填约束合入。
    requestSchema: currentRequestSchema,
    inputSchema: hasInputProperties ? inputSchema : currentRequestSchema
  };
};

/**
 * 仅依据 OpenAPI 原文的 Query/Path/Header 声明补齐 JSON Body 的调用契约。
 * 不读取编辑器 inputSchema；保留已有属性约束，也不凭空添加 required: []。
 * 导入和历史工具回源共用此规则，避免两种运行入口产生不同的必填参数。
 */
export const completeOpenAPIRequestSchema = ({
  requestSchema,
  parameters = []
}: {
  requestSchema?: JSONSchemaInputType;
  parameters?: PathDataType['params'];
}): JSONSchemaInputType | undefined => {
  const declaredParameters = parameters.filter(
    (parameter) =>
      parameter &&
      typeof parameter.name === 'string' &&
      parameter.schema &&
      ['query', 'path', 'header'].includes(parameter.in)
  );
  if (!requestSchema || declaredParameters.length === 0) return requestSchema;

  const required = [
    ...new Set([
      ...(requestSchema.required ?? []),
      ...declaredParameters
        .filter((parameter) => parameter.required === true || parameter.in === 'path')
        .map((parameter) => parameter.name)
    ])
  ];
  return {
    ...requestSchema,
    properties: {
      ...Object.fromEntries(
        declaredParameters.map((parameter) => [
          parameter.name,
          {
            ...parameter.schema,
            ...(parameter.description ? { description: parameter.description } : {})
          }
        ])
      ),
      ...requestSchema.properties
    },
    ...(required.length ? { required } : {})
  };
};

export const parseHttpToolConfig = (
  config: NonNullable<NodeToolConfigType['httpTool']>
):
  | {
      toolsetId: string;
      toolName: string;
    }
  | undefined => {
  if (!('toolId' in config)) return undefined;

  const prefix = `${AppToolSourceEnum.http}-`;
  if (!config.toolId.startsWith(prefix)) return undefined;
  const [toolsetId, ...rest] = config.toolId.slice(prefix.length).split('/');
  const toolName = rest.join('/');
  if (!toolsetId || !toolName) return undefined;
  return {
    toolsetId,
    toolName
  };
};

/** 下游实际会读取的输出契约，字段值保持未收窄的对象，由消费方按需读取。 */
type HttpResponseOutputSchema = {
  properties: Record<string, Record<string, unknown>>;
  required: string[];
};

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasOwn = (target: Record<string, unknown>, key: string) =>
  Object.prototype.hasOwnProperty.call(target, key);

/**
 * 从 `unknown` 的响应定义里投影出下游真正会读的输出契约，沿
 * `content → application/json → schema` 逐层守卫，不做类型断言。
 *
 * - 属性项为对象时原样保留；布尔子 Schema 中 `true` 表示任意值，`false` 表示该字段不合法，
 *   后者不生成输出端口。
 * - `required` 只保留仍存在于属性里的字符串，单个坏字段（如 `properties: { invalid: null }`）
 *   只会被跳过，不会让整份导入失败。
 */
const toResponseOutputSchema = (definition: unknown): HttpResponseOutputSchema | undefined => {
  if (!isPlainRecord(definition)) return undefined;
  const content = definition.content;
  if (!isPlainRecord(content)) return undefined;
  const mediaType = content['application/json'];
  if (!isPlainRecord(mediaType)) return undefined;
  const schema = mediaType.schema;
  if (!isPlainRecord(schema)) return undefined;

  const rawProperties = isPlainRecord(schema.properties) ? schema.properties : {};
  // 用无原型对象做累加器，避免不可信键名改写原型。
  const properties: Record<string, Record<string, unknown>> = Object.create(null);
  for (const [key, value] of Object.entries(rawProperties)) {
    // `__proto__` 作为属性名时下游普通对象赋值会改写原型而不是新增端口，这里直接跳过，
    // 保证 `properties` 与 `required` 的口径一致。
    if (key === '__proto__') continue;
    if (isPlainRecord(value)) {
      properties[key] = value;
    } else if (value === true) {
      properties[key] = {};
    }
    // `false` 表示禁止出现的字段，不投影成输出端口。
  }

  const rawRequired = Array.isArray(schema.required) ? schema.required : [];
  const required = rawRequired.filter(
    (key): key is string => typeof key === 'string' && hasOwn(properties, key)
  );

  return { properties, required };
};

/**
 * 取用于生成输出契约的响应定义，优先级：精确 2xx 码 → 其余 2xx 码 → `2XX` 通配码 → `default`。
 *
 * - 整型键在 `Object.keys` 里按数值升序枚举，声明顺序并不可靠，因此在成功响应里挑第一个真能
 *   投影出属性的 Schema，而不是挑第一条定义（只声明 `false` 字段的响应不算）。
 * - `default` 只描述其余状态：一旦文档声明了成功响应，就不再回退它，避免把错误字段暴露成输出。
 */
const pickResponseOutputSchema = (response: unknown): HttpResponseOutputSchema | undefined => {
  if (!isPlainRecord(response)) return undefined;
  const preferredCodes = ['200', '201', '202'].filter((code) => hasOwn(response, code));
  const otherSuccessCodes = Object.keys(response).filter(
    (code) => /^2\d{2}$/.test(code) && !preferredCodes.includes(code)
  );
  // `2XX` 为 OpenAPI 通配写法，按大小写不敏感匹配。
  const wildcardCodes = Object.keys(response).filter((code) => /^2xx$/i.test(code));

  const successSchemas = [...preferredCodes, ...otherSuccessCodes, ...wildcardCodes].map((code) =>
    toResponseOutputSchema(response[code])
  );

  if (successSchemas.length > 0) {
    return successSchemas.find((schema) => schema && Object.keys(schema.properties).length > 0);
  }

  const defaultSchema = toResponseOutputSchema(response.default);
  return defaultSchema && Object.keys(defaultSchema.properties).length > 0
    ? defaultSchema
    : undefined;
};

export const pathData2ToolList = async (
  pathData: PathDataType[]
): Promise<HttpToolConfigType[]> => {
  try {
    return pathData.map((pathItem) => {
      const inputProperties: Record<string, JsonSchemaPropertiesItemType> = {};
      const requestProperties: Record<string, JsonSchemaPropertiesItemType> = {};
      const inputRequired: string[] = [];
      const outputProperties: Record<string, JsonSchemaPropertiesItemType> = {};
      const outputRequired: string[] = [];
      let requestSchema: JSONSchemaInputType | undefined;

      if (pathItem.params && Array.isArray(pathItem.params)) {
        pathItem.params.forEach((param) => {
          if (param.in !== 'body' && param.name && param.schema) {
            const description = param.description || param.schema.description || '';
            requestProperties[param.name] = {
              ...param.schema,
              ...(description ? { description } : {}),
              isToolParam: true
            };
            inputProperties[param.name] = {
              ...param.schema,
              type: param.schema.type || 'any',
              description,
              'x-tool-description': param.description || param.name,
              isToolParam: true
            };

            if (param.required) {
              inputRequired.push(param.name);
            }
          }
        });

        if (Object.keys(requestProperties).length > 0) {
          requestSchema = {
            type: 'object',
            properties: requestProperties,
            required: inputRequired
          };
        }
      }
      const bodySchema: JSONSchemaInputType | undefined =
        pathItem.request?.content?.['application/json']?.schema;
      if (bodySchema) {
        requestSchema = bodySchema;

        if (requestSchema.properties) {
          Object.entries(requestSchema.properties).forEach(([key, value]: [string, any]) => {
            inputProperties[key] = {
              ...value,
              type: value.type || 'any',
              description: value.description || '',
              'x-tool-description': value.description || key,
              isToolParam: true
            };
          });
        }

        if (requestSchema.required && Array.isArray(requestSchema.required)) {
          inputRequired.push(...requestSchema.required);
        }
      }

      const responseOutputSchema = pickResponseOutputSchema(pathItem.response);

      if (responseOutputSchema) {
        Object.entries(responseOutputSchema.properties).forEach(([key, value]) => {
          outputProperties[key] = {
            type: typeof value.type === 'string' ? value.type : 'any',
            description: typeof value.description === 'string' ? value.description : ''
          };
        });
        outputRequired.push(...responseOutputSchema.required);
      }

      return {
        name: pathItem.name,
        description: pathItem.description || pathItem.name,
        path: pathItem.path,
        method: pathItem.method?.toLowerCase(),
        requestSchema: pathItem.request?.content?.['application/json']?.schema
          ? completeOpenAPIRequestSchema({ requestSchema, parameters: pathItem.params })
          : requestSchema,
        inputSchema: {
          type: 'object',
          properties: inputProperties,
          required: inputRequired
        },
        outputSchema: {
          type: 'object',
          properties: outputProperties,
          required: outputRequired
        }
      };
    });
  } catch (error) {
    console.error('Error converting API schema to tool list:', error);
    return [];
  }
};
