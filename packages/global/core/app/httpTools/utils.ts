import { getNanoid } from '../../../common/string/tools';
import type { PathDataType} from './type';
import { type OpenApiJsonSchema } from './type';
import yaml from 'js-yaml';
import type { OpenAPIV3 } from 'openapi-types';
import { FlowNodeOutputTypeEnum } from '../../workflow/node/constant';
import { WorkflowIOValueTypeEnum } from '../../workflow/constants';
import SwaggerParser from '@apidevtools/swagger-parser';
import { type RuntimeNodeItemType } from '../../workflow/runtime/type';
import { FlowNodeTypeEnum } from '../../workflow/node/constant';
import { type HttpToolConfigType } from '../type';
import { PluginSourceEnum } from '../plugin/constants';
import { jsonSchema2NodeInput } from '../jsonschema';
import { i18nT } from '../../../../web/i18n/utils';
import { NodeOutputKeyEnum } from '../../workflow/constants';
import { type StoreSecretValueType } from '../../../common/secret/type';
import { type JsonSchemaPropertiesItemType } from '../jsonschema';

export const str2OpenApiSchema = async (yamlStr = ''): Promise<OpenApiJsonSchema> => {
  try {
    const data = (() => {
      try {
        return JSON.parse(yamlStr);
      } catch (jsonError) {
        return yaml.load(yamlStr, { schema: yaml.FAILSAFE_SCHEMA });
      }
    })();
    const jsonSchema = (await SwaggerParser.parse(data)) as OpenAPIV3.Document;

    const serverPath = (() => {
      if (jsonSchema.servers && jsonSchema.servers.length > 0) {
        return jsonSchema.servers[0].url || '';
      }
      if (data.host || data.basePath) {
        const scheme = data.schemes && data.schemes.length > 0 ? data.schemes[0] : 'https';
        const host = data.host || '';
        const basePath = data.basePath || '';
        return `${scheme}://${host}${basePath}`;
      }
      return '';
    })();

    const pathData = Object.keys(jsonSchema.paths)
      .map((path) => {
        const methodData: any = data.paths[path];
        return Object.keys(methodData)
          .filter((method) =>
            ['get', 'post', 'put', 'delete', 'patch'].includes(method.toLocaleLowerCase())
          )
          .map((method) => {
            const methodInfo = methodData[method];
            if (methodInfo.deprecated) return;

            const requestBody = (() => {
              if (methodInfo?.requestBody) {
                return methodInfo.requestBody;
              }
              if (methodInfo.parameters) {
                const bodyParam = methodInfo.parameters.find(
                  (param: OpenAPIV3.ParameterObject) => param.in === 'body'
                );
                if (bodyParam) {
                  return {
                    content: {
                      'application/json': {
                        schema: bodyParam.schema
                      }
                    }
                  };
                }
              }
              return undefined;
            })();

            const result = {
              path,
              method,
              name: methodInfo.operationId || path,
              description: methodInfo.description || methodInfo.summary,
              params: methodInfo.parameters,
              request: requestBody,
              response: methodInfo.responses
            };
            return result;
          });
      })
      .flat()
      .filter(Boolean) as OpenApiJsonSchema['pathData'];
    return { pathData, serverPath };
  } catch (err) {
    throw new Error('Invalid Schema');
  }
};

export const getType = (schema: { type: string; items?: { type: string } }) => {
  const typeMap: { [key: string]: WorkflowIOValueTypeEnum } = {
    string: WorkflowIOValueTypeEnum.arrayString,
    number: WorkflowIOValueTypeEnum.arrayNumber,
    integer: WorkflowIOValueTypeEnum.arrayNumber,
    boolean: WorkflowIOValueTypeEnum.arrayBoolean,
    object: WorkflowIOValueTypeEnum.arrayObject
  };

  if (schema?.type === 'integer') {
    return WorkflowIOValueTypeEnum.number;
  }

  if (schema?.type === 'array' && schema?.items) {
    const itemType = typeMap[schema.items.type];
    if (itemType) {
      return itemType;
    }
  }

  return schema?.type as WorkflowIOValueTypeEnum;
};

export const getHTTPToolSetRuntimeNode = ({
  name,
  avatar,
  baseUrl = '',
  customHeaders = '',
  apiSchemaStr = '',
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
        baseUrl,
        toolList,
        headerSecret,
        customHeaders,
        apiSchemaStr,
        toolId: ''
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
        toolId: `${PluginSourceEnum.http}-${parentId}/${tool.name}`
      }
    },
    inputs: jsonSchema2NodeInput(tool.inputSchema),
    outputs: [
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

export const apiSchemaStr2ToolList = async (
  pathData: PathDataType[]
): Promise<HttpToolConfigType[]> => {
  try {
    return pathData.map((pathItem) => {
      const properties: Record<string, JsonSchemaPropertiesItemType> = {};
      const required: string[] = [];

      // Process path parameters and query parameters
      if (pathItem.params && Array.isArray(pathItem.params)) {
        pathItem.params.forEach((param: any) => {
          if (param.name && param.schema) {
            properties[param.name] = {
              type: param.schema.type || 'string',
              description: param.description || `${param.name} parameter`
            };

            if (param.required) {
              required.push(param.name);
            }
          }
        });
      }

      // Process request body
      if (pathItem.request?.content?.['application/json']?.schema) {
        const requestSchema = pathItem.request.content['application/json'].schema;

        if (requestSchema.properties) {
          Object.entries(requestSchema.properties).forEach(([key, value]: [string, any]) => {
            properties[key] = {
              type: value.type || 'string',
              description: value.description || `${key} property`
            };
          });
        }

        if (requestSchema.required && Array.isArray(requestSchema.required)) {
          required.push(...requestSchema.required);
        }
      }

      return {
        name: pathItem.name || `${pathItem.method?.toUpperCase()} ${pathItem.path}`,
        description: pathItem.description || `${pathItem.method?.toUpperCase()} ${pathItem.path}`,
        path: pathItem.path,
        method: pathItem.method?.toLowerCase(),
        inputSchema: {
          type: 'object',
          properties,
          required
        }
      };
    });
  } catch (error) {
    console.error('Error converting API schema to tool list:', error);
    return [];
  }
};
