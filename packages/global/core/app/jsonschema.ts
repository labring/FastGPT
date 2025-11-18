import { WorkflowIOValueTypeEnum } from '../workflow/constants';
import { FlowNodeInputTypeEnum, FlowNodeOutputTypeEnum } from '../workflow/node/constant';
import type { FlowNodeInputItemType, FlowNodeOutputItemType } from '../workflow/type/io';
import SwaggerParser from '@apidevtools/swagger-parser';
import yaml from 'js-yaml';
import type { OpenAPIV3 } from 'openapi-types';
import type { OpenApiJsonSchema } from './tool/httpTool/type';
import { i18nT } from '../../../web/i18n/utils';

type SchemaInputValueType = 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
export type JsonSchemaPropertiesItemType = {
  description?: string;
  'x-tool-description'?: string;
  type: SchemaInputValueType;
  enum?: string[];
  minimum?: number;
  maximum?: number;
  items?: { type: SchemaInputValueType };
};
export type JSONSchemaInputType = {
  type: SchemaInputValueType;
  properties?: Record<string, JsonSchemaPropertiesItemType>;
  required?: string[];
};
export type JSONSchemaOutputType = {
  type: SchemaInputValueType;
  properties?: Record<string, JsonSchemaPropertiesItemType>;
  required?: string[];
};

export const getNodeInputTypeFromSchemaInputType = ({
  type,
  arrayItems
}: {
  type: SchemaInputValueType;
  arrayItems?: { type: SchemaInputValueType };
}) => {
  if (type === 'string') return WorkflowIOValueTypeEnum.string;
  if (type === 'number') return WorkflowIOValueTypeEnum.number;
  if (type === 'integer') return WorkflowIOValueTypeEnum.number;
  if (type === 'boolean') return WorkflowIOValueTypeEnum.boolean;
  if (type === 'object') return WorkflowIOValueTypeEnum.object;

  if (!arrayItems) return WorkflowIOValueTypeEnum.arrayAny;

  const itemType = arrayItems.type;
  if (itemType === 'string') return WorkflowIOValueTypeEnum.arrayString;
  if (itemType === 'number') return WorkflowIOValueTypeEnum.arrayNumber;
  if (itemType === 'integer') return WorkflowIOValueTypeEnum.arrayNumber;
  if (itemType === 'boolean') return WorkflowIOValueTypeEnum.arrayBoolean;
  if (itemType === 'object') return WorkflowIOValueTypeEnum.arrayObject;

  return WorkflowIOValueTypeEnum.arrayAny;
};
const getNodeInputRenderTypeFromSchemaInputType = ({
  type,
  enum: enumList,
  minimum,
  maximum
}: JsonSchemaPropertiesItemType) => {
  if (enumList && enumList.length > 0) {
    return {
      value: enumList[0],
      renderTypeList: [FlowNodeInputTypeEnum.select],
      list: enumList.map((item) => ({ label: item, value: item }))
    };
  }
  if (type === 'string') {
    return {
      renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference]
    };
  }
  if (type === 'number') {
    return {
      renderTypeList: [FlowNodeInputTypeEnum.numberInput, FlowNodeInputTypeEnum.reference],
      max: maximum,
      min: minimum
    };
  }
  if (type === 'boolean') {
    return {
      renderTypeList: [FlowNodeInputTypeEnum.switch]
    };
  }
  return { renderTypeList: [FlowNodeInputTypeEnum.JSONEditor, FlowNodeInputTypeEnum.reference] };
};
export const jsonSchema2NodeInput = ({
  jsonSchema,
  schemaType
}: {
  jsonSchema: JSONSchemaInputType;
  schemaType: 'mcp' | 'http';
}): FlowNodeInputItemType[] => {
  return Object.entries(jsonSchema?.properties || {}).map(([key, value]) => ({
    key,
    label: key,
    valueType: getNodeInputTypeFromSchemaInputType({ type: value.type, arrayItems: value.items }),
    description: value.description,
    toolDescription: schemaType === 'http' ? value['x-tool-description'] : value.description || key,
    required: jsonSchema?.required?.includes(key),
    ...getNodeInputRenderTypeFromSchemaInputType(value)
  }));
};
export const jsonSchema2NodeOutput = (
  jsonSchema: JSONSchemaOutputType
): FlowNodeOutputItemType[] => {
  return Object.entries(jsonSchema?.properties || {}).map(([key, value]) => ({
    id: key,
    key,
    label: key,
    required: jsonSchema?.required?.includes(key),
    type: FlowNodeOutputTypeEnum.static,
    valueType: getNodeInputTypeFromSchemaInputType({ type: value.type, arrayItems: value.items }),
    description: value.description,
    toolDescription: value['x-tool-description'] ?? value.description ?? key
  }));
};
export const str2OpenApiSchema = async (yamlStr = ''): Promise<OpenApiJsonSchema> => {
  try {
    const data = (() => {
      try {
        return JSON.parse(yamlStr);
      } catch (jsonError) {
        return yaml.load(yamlStr, { schema: yaml.FAILSAFE_SCHEMA });
      }
    })();
    const jsonSchema = (await SwaggerParser.dereference(data)) as OpenAPIV3.Document;

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
        const methodData: any = jsonSchema.paths[path];
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
    return Promise.reject(i18nT('common:plugin.Invalid Schema'));
  }
};
export const getSchemaValueType = (schema: { type: string; items?: { type: string } }) => {
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
