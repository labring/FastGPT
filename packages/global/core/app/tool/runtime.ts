import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv';
import type { ChatCompletionTool } from '../../ai/llm/type';
import type { FlowNodeInputItemType } from '../../workflow/type/io';
import { AgentToolInputModeEnum } from './constants';
import {
  canInputBeAgentGenerated,
  canInputBeManuallyConfigured,
  isAgentGeneratedToolInput
} from '../formEdit/utils';
import {
  buildModelVisibleToolJsonSchema,
  type JSONSchemaInputType,
  type JsonSchemaPropertiesItemType
} from '../jsonschema';

export type ToolInputDefinition = {
  key: string;
  jsonSchema?: JsonSchemaPropertiesItemType;
  nodeInput: FlowNodeInputItemType;
  allowedModes: AgentToolInputModeEnum[];
};

export type ToolInputConfiguration = {
  key: string;
  mode: AgentToolInputModeEnum;
  binding?: unknown;
};

export type CompiledToolRuntime = {
  modelTool: ChatCompletionTool;
  agentGeneratedKeys: string[];
  fixedInputBindings: Record<string, unknown>;
};

const hasOwn = (value: object, key: PropertyKey) =>
  Object.prototype.hasOwnProperty.call(value, key);

/** 将最新 NodeIO 和可选原始 schema 归一为工具参数定义。 */
const createToolInputDefinitions = ({
  inputs,
  jsonSchema
}: {
  inputs: FlowNodeInputItemType[];
  jsonSchema?: JSONSchemaInputType;
}): ToolInputDefinition[] =>
  inputs.map((input) => {
    const canAgentGenerate = canInputBeAgentGenerated(input);
    const canConfigureManually =
      canInputBeManuallyConfigured({ renderTypeList: input.renderTypeList ?? [] }) ||
      !canAgentGenerate;

    return {
      key: input.key,
      jsonSchema: jsonSchema?.properties?.[input.key] ?? input.customJsonSchema,
      nodeInput: input,
      allowedModes: [
        ...(canAgentGenerate ? [AgentToolInputModeEnum.agentGenerated] : []),
        ...(canConfigureManually ? [AgentToolInputModeEnum.manual] : [])
      ]
    };
  });

/** 读取 NodeIO 的最终输入来源和固定绑定，供两种持久化适配器共用。 */
const createToolInputConfigurations = (
  definitions: ToolInputDefinition[]
): ToolInputConfiguration[] =>
  definitions.map(({ key, nodeInput, allowedModes }) => {
    const requestedMode = isAgentGeneratedToolInput(nodeInput)
      ? AgentToolInputModeEnum.agentGenerated
      : AgentToolInputModeEnum.manual;
    const mode = allowedModes.includes(requestedMode)
      ? requestedMode
      : (allowedModes[0] ?? AgentToolInputModeEnum.manual);
    const binding = hasOwn(nodeInput, 'value') ? nodeInput.value : nodeInput.defaultValue;

    return {
      key,
      mode,
      ...(binding !== undefined ? { binding } : {})
    };
  });

/**
 * 编译模型 function schema、Agent 参数白名单和固定输入绑定。
 * 调用方只需保存自己的配置格式，运行时统一消费该结果。
 */
export const compileToolRuntime = ({
  toolId,
  name,
  description,
  inputs,
  jsonSchema,
  fixedInputBindings: providedFixedInputBindings = {}
}: {
  toolId: string;
  name: string;
  description?: string;
  inputs: FlowNodeInputItemType[];
  jsonSchema?: JSONSchemaInputType;
  fixedInputBindings?: Record<string, unknown>;
}): CompiledToolRuntime => {
  const definitions = createToolInputDefinitions({ inputs, jsonSchema });
  const configurations = createToolInputConfigurations(definitions);
  const agentGeneratedInputs = definitions
    .filter((definition, index) => {
      const configuration = configurations[index];
      return (
        configuration.mode === AgentToolInputModeEnum.agentGenerated &&
        definition.allowedModes.includes(AgentToolInputModeEnum.agentGenerated)
      );
    })
    .map((definition) => definition.nodeInput);
  const parameters = buildModelVisibleToolJsonSchema({
    inputs,
    toolParams: agentGeneratedInputs,
    jsonSchema
  });
  const agentGeneratedKeys = Object.keys(parameters.properties ?? {});
  const generatedKeySet = new Set(agentGeneratedKeys);
  const fixedInputBindings = {
    ...providedFixedInputBindings,
    ...Object.fromEntries(
      configurations.flatMap((configuration) => {
        if (
          configuration.mode !== AgentToolInputModeEnum.manual ||
          configuration.binding === undefined
        ) {
          return [];
        }
        return [[configuration.key, configuration.binding]];
      })
    )
  };
  Object.keys(fixedInputBindings).forEach((key) => {
    if (generatedKeySet.has(key)) {
      throw new Error(`Tool input ${key} cannot be both generated and fixed`);
    }
  });

  return {
    modelTool: {
      type: 'function',
      function: {
        name: toolId,
        description: [name, description].filter(Boolean).join(': '),
        parameters
      }
    },
    agentGeneratedKeys,
    fixedInputBindings
  };
};

/** 过滤模型未知字段，并将模型参数与固定绑定合并为最终工具入参。 */
export const mergeToolRuntimeParams = ({
  agentGeneratedKeys,
  fixedInputBindings,
  aiParams = {}
}: Pick<CompiledToolRuntime, 'agentGeneratedKeys' | 'fixedInputBindings'> & {
  aiParams?: Record<string, unknown>;
}): Record<string, unknown> => {
  const generatedKeySet = new Set(agentGeneratedKeys);
  const conflictingKey = Object.keys(fixedInputBindings).find((key) => generatedKeySet.has(key));
  if (conflictingKey) {
    throw new Error(`Tool input ${conflictingKey} cannot be both generated and fixed`);
  }

  return {
    ...fixedInputBindings,
    ...Object.fromEntries(Object.entries(aiParams).filter(([key]) => generatedKeySet.has(key)))
  };
};

export type ToolSchemaValidationResult = {
  success: boolean;
  errors: string[];
};

const ajv = new Ajv({ allErrors: true, strict: false, validateFormats: false });
const validatorCache = new Map<string, ValidateFunction>();

const getValidator = (schema: object) => {
  const cacheKey = JSON.stringify(schema);
  const cached = validatorCache.get(cacheKey);
  if (cached) return cached;

  const validator = ajv.compile(schema);
  validatorCache.set(cacheKey, validator);
  return validator;
};

const formatValidationErrors = (errors?: ErrorObject[] | null) =>
  (errors ?? []).map((error) => `${error.instancePath || '/'} ${error.message ?? 'is invalid'}`);

/** 使用原始 JSON Schema property 校验单个手工配置值。 */
export const validateToolInputValue = ({
  schema,
  value
}: {
  schema?: JsonSchemaPropertiesItemType;
  value: unknown;
}): ToolSchemaValidationResult => {
  if (!schema) return { success: true, errors: [] };

  try {
    const validator = getValidator(schema);
    const success = validator(value);
    return {
      success,
      errors: success ? [] : formatValidationErrors(validator.errors)
    };
  } catch (error) {
    return {
      success: false,
      errors: [error instanceof Error ? error.message : String(error)]
    };
  }
};

/** 在外部工具调用前使用完整原始 schema 校验已经剔除内部字段的参数。 */
export const validateToolRuntimeParams = ({
  jsonSchema,
  params
}: {
  jsonSchema?: JSONSchemaInputType;
  params: Record<string, unknown>;
}): ToolSchemaValidationResult => {
  if (!jsonSchema) return { success: true, errors: [] };

  try {
    const validator = getValidator(jsonSchema);
    const success = validator(params);
    return {
      success,
      errors: success ? [] : formatValidationErrors(validator.errors)
    };
  } catch (error) {
    return {
      success: false,
      errors: [error instanceof Error ? error.message : String(error)]
    };
  }
};

/** 服务端运行时断言，错误信息保持可定位的字段路径。 */
export const assertToolRuntimeParams = (props: Parameters<typeof validateToolRuntimeParams>[0]) => {
  const result = validateToolRuntimeParams(props);
  if (!result.success) {
    throw new Error(`Tool input validation failed: ${result.errors.join('; ')}`);
  }
};
