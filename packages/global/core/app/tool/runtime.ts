import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv';
import Ajv2019 from 'ajv/dist/2019.js';
import Ajv2020 from 'ajv/dist/2020.js';
import { normalizeJsonSchema } from '../../../common/jsonSchema/utils';
import type { ChatCompletionTool } from '../../ai/llm/type';
import { FlowNodeInputTypeEnum } from '../../workflow/node/constant';
import type { FlowNodeInputItemType } from '../../workflow/type/io';
import { AgentToolInputModeEnum } from './constants';
import {
  canInputBeAgentGenerated,
  canInputBeManuallyConfigured,
  isAgentGeneratedToolInput
} from '../formEdit/utils';
import { getSelectedInputRenderType } from '../../../common/workflow/reference';
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
    // reference 在工作流执行前已解析为固定值，不受 Agent 配置页手动控件范围限制。
    const canUseFixedBinding =
      canInputBeManuallyConfigured({ renderTypeList: input.renderTypeList ?? [] }) ||
      getSelectedInputRenderType(input) === FlowNodeInputTypeEnum.reference ||
      !canAgentGenerate;

    return {
      key: input.key,
      jsonSchema: jsonSchema?.properties?.[input.key] ?? input.customJsonSchema,
      nodeInput: input,
      allowedModes: [
        ...(canAgentGenerate ? [AgentToolInputModeEnum.agentGenerated] : []),
        ...(canUseFixedBinding ? [AgentToolInputModeEnum.manual] : [])
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
  const parameterSchema = buildModelVisibleToolJsonSchema({
    inputs,
    toolParams: agentGeneratedInputs,
    jsonSchema
  }) as JSONSchemaInputType;
  const agentGeneratedKeys = Object.keys(parameterSchema.properties ?? {});
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
        // OpenAI function calling 约定省略 parameters 表示工具没有模型生成入参。
        ...(agentGeneratedKeys.length > 0 ? { parameters: parameterSchema } : {})
      }
    },
    agentGeneratedKeys,
    fixedInputBindings
  };
};

/** 透传模型参数，并将固定绑定合并为最终工具入参；固定绑定始终优先。 */
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
    ...aiParams,
    ...fixedInputBindings
  };
};

export type ToolSchemaValidationResult = {
  success: boolean;
  errors: string[];
};

const ajvOptions = { allErrors: true, strict: false, validateFormats: false } as const;
const ajvDraft7 = new Ajv(ajvOptions);
const ajvDraft2019 = new Ajv2019(ajvOptions);
const ajvDraft2020 = new Ajv2020(ajvOptions);
const validatorCache = new Map<string, ValidateFunction>();

const getAjv = (schema: object) => {
  const dialect = (schema as { $schema?: unknown }).$schema;
  if (typeof dialect === 'string') {
    if (dialect.includes('/draft/2020-12/')) return ajvDraft2020;
    if (dialect.includes('/draft/2019-09/')) return ajvDraft2019;
  }
  return ajvDraft7;
};

/** 编译并缓存工具校验器；旧版 property 必填标记转换为标准对象 required，原始 Schema 保持不变。 */
const getValidator = (schema: object) => {
  const cacheKey = JSON.stringify(schema);
  const cached = validatorCache.get(cacheKey);
  if (cached) return cached;

  const validator = getAjv(schema).compile(normalizeJsonSchema({ schema }) as object);
  validatorCache.set(cacheKey, validator);
  return validator;
};

const formatValidationErrors = (errors?: ErrorObject[] | null) =>
  (errors ?? []).map((error) => `${error.instancePath || '/'} ${error.message ?? 'is invalid'}`);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const ROOT_OBJECT_CONSTRAINT_KEYS = new Set([
  '$id',
  'id',
  'required',
  'minProperties',
  'maxProperties',
  'dependentRequired',
  'dependencies',
  'dependentSchemas',
  'additionalProperties',
  'patternProperties',
  'unevaluatedProperties',
  'propertyNames',
  'allOf',
  'anyOf',
  'oneOf',
  'not',
  'if',
  'then',
  'else',
  'const',
  'enum'
]);

const decodeJsonPointerSegment = (segment: string): string | undefined => {
  try {
    return decodeURIComponent(segment).replace(/~1/g, '/').replace(/~0/g, '~');
  } catch {
    return undefined;
  }
};

/** 解析指向根 Schema 内部的 JSON Pointer `$ref`（如 `#/$defs/foo`、`#/properties/bar`）。 */
export const resolveLocalJsonSchemaRef = ({
  rootSchema,
  ref
}: {
  rootSchema?: Record<string, unknown>;
  ref: string;
}): unknown => {
  if (!rootSchema || !ref.startsWith('#')) return undefined;
  if (ref === '#') return rootSchema;
  if (!ref.startsWith('#/')) return undefined;

  let current: unknown = rootSchema;
  for (const rawSegment of ref.slice(2).split('/')) {
    const decodedSegment = decodeJsonPointerSegment(rawSegment);
    if (decodedSegment === undefined) return undefined;

    if (Array.isArray(current)) {
      const index = Number(decodedSegment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) return undefined;
      current = current[index];
      continue;
    }

    if (!isRecord(current) || !Object.prototype.hasOwnProperty.call(current, decodedSegment)) {
      return undefined;
    }
    current = current[decodedSegment];
  }

  return current;
};

/** 收集目标属性及其可达 `$ref` 链条依赖的顶层同级属性名，避免无关损坏属性导致 AJV 编译失败。 */
const collectReferencedRootProperties = ({
  schema,
  rootSchema
}: {
  schema: unknown;
  rootSchema: Record<string, unknown>;
}): Set<string> => {
  const visitedRefs = new Set<string>();
  const referencedPropertyKeys = new Set<string>();

  const visit = (node: unknown) => {
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (!isRecord(node)) return;

    if (typeof node.$ref === 'string' && !visitedRefs.has(node.$ref)) {
      visitedRefs.add(node.$ref);
      if (node.$ref.startsWith('#/properties/')) {
        const rawKey = node.$ref.slice('#/properties/'.length).split('/')[0];
        const decodedKey = decodeJsonPointerSegment(rawKey);
        if (decodedKey !== undefined) {
          referencedPropertyKeys.add(decodedKey);
        }
      }
      const target = resolveLocalJsonSchemaRef({ rootSchema, ref: node.$ref });
      if (target !== undefined) visit(target);
    }

    for (const [key, child] of Object.entries(node)) {
      if (key === 'const' || key === 'enum' || key === 'default' || key === 'examples') continue;
      visit(child);
    }
  };

  visit(schema);
  return referencedPropertyKeys;
};

/**
 * 在完整根 Schema 上下文（保留 `definitions`、`$defs`、自定义容器及当前属性可达的同级 `properties`）中
 * 校验单个顶层属性值，仅剥离 `$id` 与根级对象整体约束。
 * 用于需要区分“确定拒绝”与“Schema 无法编译”的边界场景，避免误删无法判定的输入。
 */
export const validateToolPropertyValue = ({
  rootSchema,
  propertyKey,
  propertySchema,
  value
}: {
  rootSchema?: Record<string, unknown>;
  propertyKey: string;
  propertySchema: unknown;
  value: unknown;
}): 'valid' | 'invalid' | 'error' => {
  try {
    const normalizedRoot = rootSchema ? normalizeJsonSchema({ schema: rootSchema }) : undefined;
    const baseSchema: Record<string, unknown> = isRecord(normalizedRoot)
      ? Object.fromEntries(
          Object.entries(normalizedRoot).filter(
            ([key]) => key !== 'properties' && !ROOT_OBJECT_CONSTRAINT_KEYS.has(key)
          )
        )
      : {};
    const normalizedProperty = normalizeJsonSchema({ schema: propertySchema });
    const wrapperProperties: Record<string, unknown> = {
      [propertyKey]: normalizedProperty
    };

    if (isRecord(normalizedRoot) && isRecord(normalizedRoot.properties)) {
      const referencedKeys = collectReferencedRootProperties({
        schema: normalizedProperty,
        rootSchema: normalizedRoot
      });
      for (const refKey of referencedKeys) {
        if (
          refKey !== propertyKey &&
          Object.prototype.hasOwnProperty.call(normalizedRoot.properties, refKey)
        ) {
          wrapperProperties[refKey] = normalizedRoot.properties[refKey];
        }
      }
    }

    const wrapperSchema: Record<string, unknown> = {
      ...baseSchema,
      type: 'object',
      properties: wrapperProperties
    };
    const validator = getValidator(wrapperSchema);
    return validator({ [propertyKey]: value }) ? 'valid' : 'invalid';
  } catch {
    return 'error';
  }
};

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
