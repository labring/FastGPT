import { getNanoid } from '../../../../common/string/tools';
import type { PathDataType, HttpToolConfigType } from './type';
import { type RuntimeNodeItemType } from '../../../workflow/runtime/type';
import { FlowNodeOutputTypeEnum, FlowNodeTypeEnum } from '../../../workflow/node/constant';
import { AppToolSourceEnum } from '../constants';
import {
  getNodeInputTypeFromSchemaInputType,
  jsonSchema2NodeInput,
  jsonSchema2NodeOutput
} from '../../jsonschema';
import { type StoreSecretValueType } from '../../../../common/secret/type';
import { type JsonSchemaPropertiesItemType } from '../../jsonschema';
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
  tool: Omit<HttpToolConfigType, 'path' | 'method'>;
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
    requestSchema: currentRequestSchema,
    inputSchema: hasInputProperties ? inputSchema : currentRequestSchema
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
      let requestSchema = undefined;

      if (pathItem.params && Array.isArray(pathItem.params)) {
        pathItem.params.forEach((param) => {
          if (param.name && param.schema) {
            const description = param.description || param.schema.description || '';
            requestProperties[param.name] = {
              ...param.schema,
              ...(description ? { description } : {}),
              isToolParam: true
            };
            inputProperties[param.name] = {
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
      if (pathItem.request?.content?.['application/json']?.schema) {
        requestSchema = pathItem.request.content['application/json'].schema;

        if (requestSchema.properties) {
          Object.entries(requestSchema.properties).forEach(([key, value]: [string, any]) => {
            inputProperties[key] = {
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

      const responseToProcess =
        pathItem.response?.['200'] ||
        pathItem.response?.['201'] ||
        pathItem.response?.['202'] ||
        pathItem.response?.default;

      if (responseToProcess?.content?.['application/json']?.schema) {
        const responseSchema = responseToProcess.content['application/json'].schema;
        if (responseSchema.properties) {
          Object.entries(responseSchema.properties).forEach(([key, value]: [string, any]) => {
            outputProperties[key] = {
              type: value.type || 'any',
              description: value.description || ''
            };
          });
        }
        if (responseSchema.required && Array.isArray(responseSchema.required)) {
          outputRequired.push(...responseSchema.required);
        }
      }

      return {
        name: pathItem.name,
        description: pathItem.description || pathItem.name,
        path: pathItem.path,
        method: pathItem.method?.toLowerCase(),
        requestSchema,
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
