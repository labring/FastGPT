import { WorkflowIOValueTypeEnum } from '../workflow/constants';
import { FlowNodeInputTypeEnum, FlowNodeOutputTypeEnum } from '../workflow/node/constant';
import type { FlowNodeInputItemType, FlowNodeOutputItemType } from '../workflow/type/io';
import SwaggerParser from '@apidevtools/swagger-parser';
import yaml from 'js-yaml';
import type { OpenAPIV3 } from 'openapi-types';
import type { OpenApiJsonSchema } from './tool/httpTool/type';
import { i18nT } from '../../../web/i18n/utils';
import z from 'zod';

export const JsonSchemaPropertiesItemSchema = z.object({
  // 基本类型定义
  type: z.any().optional(), // 可能不存在（使用 anyOf/oneOf 时）

  // 组合类型（JSON Schema 规范）
  anyOf: z.array(z.any()).optional(), // 任意一个匹配（联合类型，如 Optional[T]）
  oneOf: z.array(z.any()).optional(), // 只能匹配一个
  allOf: z.array(z.any()).optional(), // 必须全部匹配
  not: z.any().optional(), // 不匹配

  // 枚举和常量
  enum: z.array(z.any()).optional(), // 枚举值
  const: z.any().optional(), // 常量值

  // 字符串约束
  minLength: z.number().optional(), // 最小长度
  maxLength: z.number().optional(), // 最大长度
  pattern: z.string().optional(), // 正则表达式
  format: z.string().optional(), // 格式（email, uri, date-time 等）

  // 数字约束
  minimum: z.number().optional(), // 最小值
  maximum: z.number().optional(), // 最大值
  exclusiveMinimum: z.union([z.number(), z.boolean()]).optional(), // 排他最小值
  exclusiveMaximum: z.union([z.number(), z.boolean()]).optional(), // 排他最大值
  multipleOf: z.number().optional(), // 倍数

  // 数组约束
  items: z.any().optional(), // 数组项类型
  minItems: z.number().optional(), // 最小项数
  maxItems: z.number().optional(), // 最大项数
  uniqueItems: z.boolean().optional(), // 唯一项

  // 对象约束
  properties: z.record(z.string(), z.any()).optional(), // 对象属性
  required: z.array(z.string()).optional(), // 必填字段
  additionalProperties: z.union([z.boolean(), z.any()]).optional(), // 额外属性

  // 元数据
  title: z.string().optional(), // 标题
  description: z.string().optional(), // 描述
  default: z.any().optional(), // 默认值
  examples: z.array(z.any()).optional(), // 示例

  // 自定义扩展（FastGPT 专用）
  'x-tool-description': z.string().optional() // 工具描述
});
export type JsonSchemaPropertiesItemType = z.infer<typeof JsonSchemaPropertiesItemSchema>;

export const JSONSchemaInputTypeSchema = z.object({
  type: z.any().optional(),
  properties: z.record(z.string(), JsonSchemaPropertiesItemSchema).optional(),
  required: z.array(z.string()).optional()
});
export type JSONSchemaInputType = z.infer<typeof JSONSchemaInputTypeSchema>;

export const JSONSchemaOutputTypeSchema = z.object({
  type: z.any().optional(),
  properties: z.record(z.string(), JsonSchemaPropertiesItemSchema).optional(),
  required: z.array(z.string()).optional()
});
export type JSONSchemaOutputType = z.infer<typeof JSONSchemaOutputTypeSchema>;

export const getNodeInputTypeFromSchemaInputType = ({
  type,
  arrayItems
}: {
  type: string | undefined;
  arrayItems?: { type: string };
}) => {
  // 如果 type 为 undefined，返回 any 类型（处理 anyOf/oneOf 等联合类型）
  if (!type) return WorkflowIOValueTypeEnum.any;

  if (type === 'string') return WorkflowIOValueTypeEnum.string;
  if (type === 'number' || type === 'integer') return WorkflowIOValueTypeEnum.number;
  if (type === 'boolean') return WorkflowIOValueTypeEnum.boolean;
  if (type === 'object') return WorkflowIOValueTypeEnum.object;

  // Array
  if (type !== 'array') return WorkflowIOValueTypeEnum.any;
  if (!arrayItems) return WorkflowIOValueTypeEnum.arrayAny;

  const itemType = arrayItems.type;
  if (itemType === 'string') return WorkflowIOValueTypeEnum.arrayString;
  if (itemType === 'number' || itemType === 'integer') return WorkflowIOValueTypeEnum.arrayNumber;
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
    description: value.description
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
