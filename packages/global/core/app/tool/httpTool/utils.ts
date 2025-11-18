import { getNanoid } from '../../../../common/string/tools';
import type { PathDataType } from './type';
import { type RuntimeNodeItemType } from '../../../workflow/runtime/type';
import { FlowNodeOutputTypeEnum, FlowNodeTypeEnum } from '../../../workflow/node/constant';
import { type HttpToolConfigType } from '../../type';
import { AppToolSourceEnum } from '../constants';
import { jsonSchema2NodeInput, jsonSchema2NodeOutput } from '../../jsonschema';
import { type StoreSecretValueType } from '../../../../common/secret/type';
import { type JsonSchemaPropertiesItemType } from '../../jsonschema';
import { NodeOutputKeyEnum, WorkflowIOValueTypeEnum } from '../../../workflow/constants';
import { i18nT } from '../../../../../web/i18n/utils';

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
  parentId
}: {
  tool: Omit<HttpToolConfigType, 'path' | 'method'>;
  nodeId?: string;
  avatar?: string;
  parentId: string;
}): RuntimeNodeItemType => {
  return {
    nodeId: nodeId || getNanoid(16),
    flowNodeType: FlowNodeTypeEnum.tool,
    avatar,
    intro: tool.description,
    toolConfig: {
      httpTool: {
        toolId: `${AppToolSourceEnum.http}-${parentId}/${tool.name}`
      }
    },
    inputs: jsonSchema2NodeInput({ jsonSchema: tool.inputSchema, schemaType: 'http' }),
    outputs: [
      ...jsonSchema2NodeOutput(tool.outputSchema),
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
    name: tool.name,
    version: ''
  };
};

export const pathData2ToolList = async (
  pathData: PathDataType[]
): Promise<HttpToolConfigType[]> => {
  try {
    return pathData.map((pathItem) => {
      const inputProperties: Record<string, JsonSchemaPropertiesItemType> = {};
      const inputRequired: string[] = [];
      const outputProperties: Record<string, JsonSchemaPropertiesItemType> = {};
      const outputRequired: string[] = [];

      if (pathItem.params && Array.isArray(pathItem.params)) {
        pathItem.params.forEach((param) => {
          if (param.name && param.schema) {
            inputProperties[param.name] = {
              type: param.schema.type || 'any',
              description: param.description || ''
            };

            if (param.required) {
              inputRequired.push(param.name);
            }
          }
        });
      }
      if (pathItem.request?.content?.['application/json']?.schema) {
        const requestSchema = pathItem.request.content['application/json'].schema;

        if (requestSchema.properties) {
          Object.entries(requestSchema.properties).forEach(([key, value]: [string, any]) => {
            inputProperties[key] = {
              type: value.type || 'any',
              description: value.description || ''
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
