import {
  WorkflowIOValueTypeEnum,
  toolValueTypeList,
  valueTypeJsonSchemaMap
} from '../workflow/constants';
import { FlowNodeInputTypeEnum, FlowNodeOutputTypeEnum } from '../workflow/node/constant';
import type { InputConfigType } from '../workflow/type/io';
import {
  InputConfigInputTypeEnum,
  type FlowNodeInputItemType,
  type FlowNodeOutputItemType
} from '../workflow/type/io';
import SwaggerParser from '@apidevtools/swagger-parser';
import type { OpenAPIV3 } from 'openapi-types';
import type { OpenApiJsonSchema } from './tool/httpTool/type';
import { i18nT } from '../../common/i18n/utils';
import z from 'zod';
import { parseOpenAPISchemaString } from '../../common/string/swagger';

const JsonSchemaNodeInputMetadataKey = 'x-fastgpt-node-input' as const;
const JsonSchemaNodeOutputMetadataKey = 'x-fastgpt-node-output' as const;
const workflowToolPreservedInputRenderTypes = new Set<FlowNodeInputTypeEnum>([
  FlowNodeInputTypeEnum.reference,
  FlowNodeInputTypeEnum.input,
  FlowNodeInputTypeEnum.password,
  FlowNodeInputTypeEnum.numberInput,
  FlowNodeInputTypeEnum.select,
  FlowNodeInputTypeEnum.multipleSelect,
  FlowNodeInputTypeEnum.switch,
  FlowNodeInputTypeEnum.timePointSelect,
  FlowNodeInputTypeEnum.timeRangeSelect,
  FlowNodeInputTypeEnum.customVariable,
  // Agent 生成由工具配置补充，也需要在工作流工具往返时保留。
  FlowNodeInputTypeEnum.agentGenerated
]);

const nodeInputJsonSchemaMetadataKeys = [
  'valueType',
  'defaultValue',
  'referencePlaceholder',
  'placeholder',
  'maxLength',
  'minLength',
  'list',
  'markList',
  'step',
  'max',
  'min',
  'precision',
  'timeGranularity',
  'timeRangeStart',
  'timeRangeEnd',
  'enums',
  'selectedType',
  'selectedTypeIndex',
  'renderTypeList',
  'valueDesc',
  'debugLabel',
  'description',
  'enum',
  'canEdit',
  'isPro',
  'isToolOutput',
  'deprecated'
] as const satisfies readonly (keyof FlowNodeInputItemType)[];

const nodeOutputJsonSchemaMetadataKeys = [
  'type',
  'valueType',
  'valueDesc',
  'defaultValue',
  'customFieldConfig',
  'deprecated'
] as const satisfies readonly (keyof FlowNodeOutputItemType)[];

type JsonSchemaNodeInputMetadataType = Partial<
  Pick<FlowNodeInputItemType, (typeof nodeInputJsonSchemaMetadataKeys)[number]>
>;

type JsonSchemaNodeOutputMetadataType = Partial<
  Pick<FlowNodeOutputItemType, (typeof nodeOutputJsonSchemaMetadataKeys)[number]>
>;

const pickDefinedProperties = <T extends object, K extends keyof T>(
  value: T,
  keys: readonly K[]
): Partial<Pick<T, K>> =>
  Object.fromEntries(
    keys.flatMap((key) => (value[key] === undefined ? [] : [[key, value[key]]]))
  ) as Partial<Pick<T, K>>;

/** 只保留会影响工具配置的节点元数据，运行时值和动态函数留在工作流节点中。 */
const getNodeInputJsonSchemaMetadata = (
  input: FlowNodeInputItemType
): JsonSchemaNodeInputMetadataType | undefined => {
  const canPreserveMetadata =
    input.renderTypeList.length > 0 &&
    input.renderTypeList.every((type) => workflowToolPreservedInputRenderTypes.has(type));

  return canPreserveMetadata
    ? pickDefinedProperties(input, nodeInputJsonSchemaMetadataKeys)
    : undefined;
};

const getNodeOutputJsonSchemaMetadata = (
  output: FlowNodeOutputItemType
): JsonSchemaNodeOutputMetadataType =>
  pickDefinedProperties(output, nodeOutputJsonSchemaMetadataKeys);

export const JsonSchemaPropertiesItemSchema = z
  .object({
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
    'x-tool-description': z.string().optional(), // 工具描述
    toolDescription: z.string().optional(), // 工具描述 for System Tool
    isToolParam: z.boolean().optional(), // 是否默认作为工具调用参数
    isSecret: z.boolean().optional(), // System Tool
    [JsonSchemaNodeInputMetadataKey]: z.any().optional(),
    [JsonSchemaNodeOutputMetadataKey]: z.any().optional()
  })
  .catchall(z.any());
export type JsonSchemaPropertiesItemType = z.infer<typeof JsonSchemaPropertiesItemSchema>;

const ToolParamJsonSchemaTypeSchema = z.enum([
  'string',
  'number',
  'integer',
  'boolean',
  'object',
  'array',
  'null'
]);

/** 手工工具参数使用的严格 JSON Schema，递归校验每一层的 type 和结构关系。 */
export const ToolParamJsonSchemaSchema: z.ZodType<JsonSchemaPropertiesItemType> = z.lazy(() =>
  JsonSchemaPropertiesItemSchema.extend({
    type: ToolParamJsonSchemaTypeSchema,
    properties: z.record(z.string(), ToolParamJsonSchemaSchema).optional(),
    items: ToolParamJsonSchemaSchema.optional()
  }).superRefine((schema, ctx) => {
    if (schema.properties && schema.type !== 'object') {
      ctx.addIssue({
        code: 'custom',
        path: ['properties'],
        message: 'properties is only allowed when type is object'
      });
    }
    if (schema.required && schema.type !== 'object') {
      ctx.addIssue({
        code: 'custom',
        path: ['required'],
        message: 'required is only allowed when type is object'
      });
    }
    if (schema.items && schema.type !== 'array') {
      ctx.addIssue({
        code: 'custom',
        path: ['items'],
        message: 'items is only allowed when type is array'
      });
    }
    if (schema.type === 'array' && !schema.items) {
      ctx.addIssue({
        code: 'custom',
        path: ['items'],
        message: 'items is required when type is array'
      });
    }

    const propertyKeys = new Set(Object.keys(schema.properties ?? {}));
    schema.required?.forEach((key, index) => {
      if (!propertyKeys.has(key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['required', index],
          message: `required field ${key} is not defined in properties`
        });
      }
    });
  })
);

export const JSONSchemaInputTypeSchema = z
  .object({
    type: z.any().optional(),
    properties: z.record(z.string(), JsonSchemaPropertiesItemSchema).optional(),
    required: z.array(z.string()).optional()
  })
  .catchall(z.any());
export type JSONSchemaInputType = z.infer<typeof JSONSchemaInputTypeSchema>;

export const JSONSchemaOutputTypeSchema = z
  .object({
    type: z.any().optional(),
    properties: z.record(z.string(), JsonSchemaPropertiesItemSchema).optional(),
    required: z.array(z.string()).optional()
  })
  .catchall(z.any());
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

/** 解析并严格校验手工工具参数 Schema，同时提取参数描述和工作流值类型。 */
export const parseToolParamJsonSchema = (schemaString: string) => {
  const schema = ToolParamJsonSchemaSchema.parse(JSON.parse(schemaString));
  const description = schema.description?.trim();
  if (!description) {
    throw new Error('JSON Schema property description is required');
  }

  return {
    description,
    schema,
    valueType: getNodeInputTypeFromSchemaInputType({
      type: schema.type,
      arrayItems: schema.items
    })
  };
};

const getNodeInputRenderTypeFromSchemaInputType = ({
  type,
  items,
  enum: enumList,
  minimum,
  maximum
}: JsonSchemaPropertiesItemType) => {
  if (type === 'array' && items?.enum && items.enum.length > 0) {
    return {
      value: [],
      renderTypeList: [FlowNodeInputTypeEnum.multipleSelect, FlowNodeInputTypeEnum.reference],
      list: items.enum.map(formatJsonSchemaEnumOption)
    };
  }
  if (enumList && enumList.length > 0) {
    return {
      value: String(enumList[0]),
      renderTypeList: [FlowNodeInputTypeEnum.select, FlowNodeInputTypeEnum.reference],
      list: enumList.map(formatJsonSchemaEnumOption)
    };
  }
  if (type === 'string') {
    return {
      renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference]
    };
  }
  if (type === 'number' || type === 'integer') {
    return {
      renderTypeList: [FlowNodeInputTypeEnum.numberInput, FlowNodeInputTypeEnum.reference],
      max: maximum,
      min: minimum
    };
  }
  if (type === 'boolean') {
    return {
      renderTypeList: [FlowNodeInputTypeEnum.switch, FlowNodeInputTypeEnum.reference]
    };
  }
  return { renderTypeList: [FlowNodeInputTypeEnum.JSONEditor, FlowNodeInputTypeEnum.reference] };
};

/** 将 JSON Schema enum 值规范成节点输入选项，避免响应 schema 因非字符串 value 解析失败。 */
const formatJsonSchemaEnumOption = (item: any) => {
  const value = String(item);
  return { label: value, value };
};

export const jsonSchema2NodeInput = ({
  jsonSchema = { type: 'Object' },
  schemaType
}: {
  jsonSchema?: JSONSchemaInputType;
  schemaType: 'mcp' | 'http' | 'systemTool';
}): FlowNodeInputItemType[] => {
  if (!jsonSchema) return [];
  return Object.entries(jsonSchema?.properties || {}).map(([key, value]) => {
    const valueType = getNodeInputTypeFromSchemaInputType({
      type: value.type,
      arrayItems: value.items
    });
    const nodeMetadata =
      schemaType === 'systemTool' ? value[JsonSchemaNodeInputMetadataKey] : undefined;

    return {
      ...getNodeInputRenderTypeFromSchemaInputType(value),
      ...(value.default !== undefined ? { defaultValue: value.default } : {}),
      ...(nodeMetadata ?? {}),
      key,
      label: value.title || key,
      valueType: nodeMetadata?.valueType ?? valueType,
      description: nodeMetadata?.description ?? value.description,
      isToolParam: value.isToolParam,
      toolDescription:
        schemaType === 'http'
          ? value['x-tool-description']
          : schemaType === 'systemTool'
            ? value['toolDescription'] || value.description
            : value.description || key,
      required: jsonSchema?.required?.includes(key)
    };
  });
};

export const jsonSchema2NodeOutput = ({
  jsonSchema
}: { jsonSchema?: JSONSchemaOutputType } = {}): FlowNodeOutputItemType[] => {
  if (!jsonSchema) return [];
  return Object.entries(jsonSchema?.properties || {}).map(([key, value]) => {
    const valueType = getNodeInputTypeFromSchemaInputType({
      type: value.type,
      arrayItems: value.items
    });
    const nodeMetadata = value[JsonSchemaNodeOutputMetadataKey];

    return {
      ...(value.default !== undefined ? { defaultValue: value.default } : {}),
      ...(nodeMetadata ?? {}),
      id: key,
      key,
      label: value.title || key,
      required: jsonSchema?.required?.includes(key),
      type: nodeMetadata?.type ?? FlowNodeOutputTypeEnum.static,
      valueType: nodeMetadata?.valueType ?? valueType,
      description: value.description
    };
  });
};

export const str2OpenApiSchema = async (yamlStr = ''): Promise<OpenApiJsonSchema> => {
  try {
    const data = parseOpenAPISchemaString(yamlStr);
    const jsonSchema = (await SwaggerParser.dereference(data, {
      resolve: {
        file: false,
        http: false
      }
    })) as OpenAPIV3.Document;

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
  } catch {
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

export const jsonSchema2SecretInput = ({
  jsonSchema = { type: 'Object' }
}: {
  jsonSchema?: JSONSchemaInputType;
}): InputConfigType[] | undefined => {
  if (!jsonSchema) return undefined;
  return Object.entries(jsonSchema?.properties || {}).map(([key, value]) => {
    const enumValues: unknown[] | undefined =
      value.enum ??
      (value.items && typeof value.items === 'object' && Array.isArray(value.items.enum)
        ? value.items.enum
        : undefined);
    const workflowInputType = getNodeInputTypeFromSchemaInputType({
      type: value.type,
      arrayItems: value.items
    });
    // inputType => inputConfig 里面的 inputType
    const inputType = (() => {
      if (value?.isSecret === true) return InputConfigInputTypeEnum.secret;
      if (enumValues?.length) return InputConfigInputTypeEnum.select;
      switch (workflowInputType) {
        case WorkflowIOValueTypeEnum.string:
          return InputConfigInputTypeEnum.input;
        case WorkflowIOValueTypeEnum.number:
          return InputConfigInputTypeEnum.numberInput;
        case WorkflowIOValueTypeEnum.boolean:
          return InputConfigInputTypeEnum.switch;
        case WorkflowIOValueTypeEnum.object:
          return InputConfigInputTypeEnum.input;
        case WorkflowIOValueTypeEnum.arrayString:
        case WorkflowIOValueTypeEnum.arrayNumber:
        case WorkflowIOValueTypeEnum.arrayBoolean:
        case WorkflowIOValueTypeEnum.arrayObject:
        case WorkflowIOValueTypeEnum.arrayAny:
          return InputConfigInputTypeEnum.select;
        case WorkflowIOValueTypeEnum.any:
          return InputConfigInputTypeEnum.input;
      }
    })();
    return {
      inputType,
      key,
      label: value.title ?? key,
      description: value.description,
      required: jsonSchema?.required?.includes(key),
      ...(enumValues
        ? { list: enumValues.map((v: unknown) => ({ label: String(v), value: String(v) })) }
        : {})
    } satisfies InputConfigType;
  });
};

const cloneJsonSchemaProperty = (
  schema?: JsonSchemaPropertiesItemType
): JsonSchemaPropertiesItemType => {
  if (!schema) return { ...toolValueTypeList[0].jsonSchema };
  return {
    ...schema,
    items: schema.items && typeof schema.items === 'object' ? { ...schema.items } : schema.items
  };
};

const getJsonSchemaPropertyFromValueType = (
  valueType?: WorkflowIOValueTypeEnum
): JsonSchemaPropertiesItemType => {
  // Node IO 的 valueType 混合了数据类型和编辑器/运行时语义。JSON Schema 只能表达
  // 工具调用所需的通用数据结构；这里显式处理无法无损表达的类型，避免缺失映射时
  // 默认退化成 string，误导系统工具、MCP/HTTP 工具和模型侧参数 contract。
  if (valueType === WorkflowIOValueTypeEnum.any) return {};
  if (valueType === WorkflowIOValueTypeEnum.arrayAny) return { type: 'array' };
  if (valueType === WorkflowIOValueTypeEnum.arrayObject) {
    return {
      type: 'array',
      items: {
        type: 'object'
      }
    };
  }
  if (
    valueType === WorkflowIOValueTypeEnum.chatHistory ||
    valueType === WorkflowIOValueTypeEnum.datasetQuote
  ) {
    return {
      type: 'array',
      items: {
        type: 'object'
      }
    };
  }
  if (
    valueType === WorkflowIOValueTypeEnum.dynamic ||
    valueType === WorkflowIOValueTypeEnum.selectDataset ||
    valueType === WorkflowIOValueTypeEnum.selectApp
  ) {
    return {};
  }

  return cloneJsonSchemaProperty(
    valueType ? valueTypeJsonSchemaMap[valueType] : toolValueTypeList[0].jsonSchema
  );
};

const getEnumValuesFromNodeInput = (input: FlowNodeInputItemType) => {
  return [
    input.list?.map((item) => item.value).filter(Boolean),
    input.enums?.map((item) => item.value).filter(Boolean),
    input.enum?.split('\n').filter(Boolean)
  ].find((enumValues) => enumValues && enumValues.length > 0);
};

const setEnumValuesToJsonSchemaProperty = ({
  schema,
  enumValues
}: {
  schema: JsonSchemaPropertiesItemType;
  enumValues?: string[];
}) => {
  if (!enumValues?.length) return schema;

  if (schema.type === 'array') {
    return {
      ...schema,
      items: {
        ...(schema.items && typeof schema.items === 'object' ? schema.items : {}),
        enum: enumValues
      }
    };
  }

  return {
    ...schema,
    enum: enumValues
  };
};

export const nodeInput2JsonSchemaProperty = (
  input: FlowNodeInputItemType,
  { includeNodeMetadata = false }: { includeNodeMetadata?: boolean } = {}
): JsonSchemaPropertiesItemType => {
  const nodeMetadata = includeNodeMetadata ? getNodeInputJsonSchemaMetadata(input) : undefined;
  if (input.customJsonSchema) {
    const customSchema = cloneJsonSchemaProperty(input.customJsonSchema);
    return nodeMetadata
      ? { ...customSchema, [JsonSchemaNodeInputMetadataKey]: nodeMetadata }
      : customSchema;
  }

  const schema = setEnumValuesToJsonSchemaProperty({
    schema: getJsonSchemaPropertyFromValueType(input.valueType),
    enumValues: getEnumValuesFromNodeInput(input)
  });

  return {
    ...schema,
    title: input.label || input.key,
    description: input.toolDescription || input.description || '',
    ...(input.defaultValue !== undefined ? { default: input.defaultValue } : {}),
    ...(typeof input.min === 'number' ? { minimum: input.min } : {}),
    ...(typeof input.max === 'number' ? { maximum: input.max } : {}),
    ...(input.toolDescription ? { toolDescription: input.toolDescription } : {}),
    ...(input.isToolParam !== undefined ? { isToolParam: input.isToolParam } : {}),
    ...(nodeMetadata ? { [JsonSchemaNodeInputMetadataKey]: nodeMetadata } : {})
  };
};

export const nodeInputs2JsonSchema = ({
  inputs = [],
  includeNodeMetadata = false,
  filterInternalInputs = false
}: {
  inputs?: FlowNodeInputItemType[];
  includeNodeMetadata?: boolean;
  filterInternalInputs?: boolean;
}): JSONSchemaInputType => {
  const convertedInputs = filterInternalInputs
    ? inputs.filter((input) => !input.renderTypeList.includes(FlowNodeInputTypeEnum.hidden))
    : inputs;
  const properties = convertedInputs.reduce<Record<string, JsonSchemaPropertiesItemType>>(
    (acc, input) => {
      acc[input.key] = nodeInput2JsonSchemaProperty(input, { includeNodeMetadata });
      return acc;
    },
    {}
  );
  const required = convertedInputs.filter((input) => input.required).map((input) => input.key);

  return {
    type: 'object',
    properties,
    ...(required.length ? { required } : {})
  };
};

export const nodeOutput2JsonSchemaProperty = (
  output: FlowNodeOutputItemType,
  { includeNodeMetadata = false }: { includeNodeMetadata?: boolean } = {}
): JsonSchemaPropertiesItemType => ({
  ...getJsonSchemaPropertyFromValueType(output.valueType),
  title: output.label || output.key,
  description: output.description || '',
  ...(output.defaultValue !== undefined ? { default: output.defaultValue } : {}),
  ...(includeNodeMetadata
    ? { [JsonSchemaNodeOutputMetadataKey]: getNodeOutputJsonSchemaMetadata(output) }
    : {})
});

export const nodeOutputs2JsonSchema = ({
  outputs = [],
  includeNodeMetadata = false
}: {
  outputs?: FlowNodeOutputItemType[];
  includeNodeMetadata?: boolean;
} = {}): JSONSchemaOutputType => {
  const properties = outputs.reduce<Record<string, JsonSchemaPropertiesItemType>>((acc, output) => {
    acc[output.key] = nodeOutput2JsonSchemaProperty(output, { includeNodeMetadata });
    return acc;
  }, {});
  const required = outputs.filter((output) => output.required).map((output) => output.key);

  return {
    type: 'object',
    properties,
    ...(required.length ? { required } : {})
  };
};

export const inputConfig2JsonSchemaProperty = (
  inputConfig: InputConfigType
): JsonSchemaPropertiesItemType => {
  const schema = (() => {
    switch (inputConfig.inputType) {
      case InputConfigInputTypeEnum.numberInput:
        return { type: 'number' };
      case InputConfigInputTypeEnum.switch:
        return { type: 'boolean' };
      case InputConfigInputTypeEnum.secret:
        return { type: 'string', isSecret: true };
      case InputConfigInputTypeEnum.select:
      case InputConfigInputTypeEnum.input:
      default:
        return { type: 'string' };
    }
  })() satisfies JsonSchemaPropertiesItemType;

  return {
    ...setEnumValuesToJsonSchemaProperty({
      schema,
      enumValues: inputConfig.list?.map((item) => item.value).filter(Boolean)
    }),
    title: inputConfig.label || inputConfig.key,
    description: inputConfig.description || ''
  };
};

export const inputConfigs2JsonSchema = ({
  inputConfigs = []
}: {
  inputConfigs?: InputConfigType[];
} = {}): JSONSchemaInputType => {
  const properties = inputConfigs.reduce<Record<string, JsonSchemaPropertiesItemType>>(
    (acc, inputConfig) => {
      acc[inputConfig.key] = inputConfig2JsonSchemaProperty(inputConfig);
      return acc;
    },
    {}
  );
  const required = inputConfigs
    .filter((inputConfig) => inputConfig.required)
    .map((item) => item.key);

  return {
    type: 'object',
    properties,
    ...(required.length ? { required } : {})
  };
};
