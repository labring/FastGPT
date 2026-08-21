import {
  VariableItemTypeSchema,
  VariableInputEnum,
  WorkflowIOValueTypeEnum,
  textInputVariableValueTypes,
  variableMap,
  type VariableItemType
} from '@fastgpt/workflow-core';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ZodError } from 'zod';
import { CliArgumentError } from '../error';
import { readWorkflowFile } from '../io/workflowFile';
import type { CliContext, CliResult } from '../type';
import { readInputValue, requireString, runMutation } from './helpers';

const valueOptionKeys = ['value', 'valueJson', 'valueFile', 'valueEnv'] as const;
const hasValueOption = (input: Record<string, unknown>) =>
  valueOptionKeys.some((key) => input[key] !== undefined);

const VariableConfigSchema = VariableItemTypeSchema.partial()
  .omit({
    key: true,
    label: true,
    description: true,
    type: true,
    valueType: true,
    required: true,
    defaultValue: true
  })
  .strict();

const normalizeVariableInputType = (type: unknown) => {
  if (type === 'external') return VariableInputEnum.custom;
  return typeof type === 'string' ? (type as VariableInputEnum) : undefined;
};

const getVariableInputType = (valueType: WorkflowIOValueTypeEnum) => {
  if (valueType === WorkflowIOValueTypeEnum.number) return VariableInputEnum.numberInput;
  if (valueType === WorkflowIOValueTypeEnum.boolean) return VariableInputEnum.switch;
  if (valueType === WorkflowIOValueTypeEnum.arrayString) return VariableInputEnum.multipleSelect;
  return VariableInputEnum.input;
};

const specialOptionalTypes = new Set<VariableInputEnum>([
  VariableInputEnum.custom,
  VariableInputEnum.internal,
  VariableInputEnum.switch
]);

/** 校验显式交互类型与数据结构，保持 CLI 和 Web 变量编辑器的约束一致。 */
const assertVariableTypeCompatibility = ({
  type,
  valueType
}: {
  type: VariableInputEnum;
  valueType: WorkflowIOValueTypeEnum;
}) => {
  if (type === VariableInputEnum.custom || type === VariableInputEnum.internal) return;
  if (type === VariableInputEnum.input) {
    if (!textInputVariableValueTypes.includes(valueType)) {
      throw new CliArgumentError('--type input does not support this --value-type', {
        type,
        valueType
      });
    }
    return;
  }

  const config = (variableMap as Partial<typeof variableMap>)[type];
  if (config && config.defaultValueType !== valueType) {
    throw new CliArgumentError('--type and --value-type are incompatible', {
      type,
      valueType,
      expectedValueType: config.defaultValueType
    });
  }
};

const parseJson = (value: string, option: string) => {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new CliArgumentError(`${option} must contain valid JSON`);
  }
};

const parseNumberOption = (input: Record<string, unknown>, key: string) => {
  if (input[key] === undefined) return undefined;
  const value = Number(input[key]);
  if (!Number.isFinite(value)) {
    throw new CliArgumentError(
      `--${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)} must be a number`
    );
  }
  return value;
};

/** 读取完整类型配置，并让常用快捷参数覆盖 JSON 配置中的同名字段。 */
const readVariableConfig = async (
  input: Record<string, unknown>,
  context: CliContext
): Promise<Partial<VariableItemType>> => {
  const rawConfig = await (async () => {
    if (typeof input.configJson === 'string') return parseJson(input.configJson, '--config-json');
    if (typeof input.configFile === 'string') {
      const content = await readFile(resolve(context.cwd, input.configFile), 'utf8');
      return parseJson(content, '--config-file');
    }
    return {};
  })();

  const maxLength = parseNumberOption(input, 'maxLength');
  if (maxLength !== undefined && (!Number.isInteger(maxLength) || maxLength < 0)) {
    throw new CliArgumentError('--max-length must be a non-negative integer');
  }

  const shortcuts = {
    list:
      typeof input.optionsJson === 'string'
        ? parseJson(input.optionsJson, '--options-json')
        : undefined,
    min: parseNumberOption(input, 'min'),
    max: parseNumberOption(input, 'max'),
    maxLength,
    timeGranularity: typeof input.timeGranularity === 'string' ? input.timeGranularity : undefined
  };

  try {
    return VariableConfigSchema.parse({
      ...(rawConfig as Record<string, unknown>),
      ...Object.fromEntries(Object.entries(shortcuts).filter(([, value]) => value !== undefined))
    });
  } catch (error) {
    if (error instanceof ZodError) {
      throw new CliArgumentError('Variable type config is invalid', { issues: error.issues });
    }
    throw error;
  }
};

const getRequired = (input: Record<string, unknown>) => {
  if (input.required === true) return true;
  if (input.optional === true) return false;
  return undefined;
};

export const listVariables = async (
  _input: Record<string, unknown>,
  context: CliContext
): Promise<CliResult> => ({
  changed: false,
  result: (await readWorkflowFile(context.dir)).chatConfig.variables ?? []
});

export const addVariable = async (
  input: Record<string, unknown>,
  context: CliContext
): Promise<CliResult> => {
  const key = requireString(input, 'key');
  const valueType = requireString(input, 'valueType') as WorkflowIOValueTypeEnum;
  const type = normalizeVariableInputType(input.type) ?? getVariableInputType(valueType);
  assertVariableTypeCompatibility({ type, valueType });
  if (input.required === true && specialOptionalTypes.has(type)) {
    throw new CliArgumentError('--required is not supported for this variable type', { type });
  }
  const defaultValue = hasValueOption(input)
    ? await readInputValue({ input, context, valueType })
    : undefined;
  const config = await readVariableConfig(input, context);
  const variable: VariableItemType = {
    ...config,
    key,
    label: typeof input.label === 'string' ? input.label : key,
    description: typeof input.description === 'string' ? input.description : '',
    valueType,
    type,
    required: specialOptionalTypes.has(type) ? false : input.required === true,
    defaultValue
  };
  return runMutation({ input, context, command: { type: 'variable.add', variable } });
};

export const updateVariable = async (
  input: Record<string, unknown>,
  context: CliContext
): Promise<CliResult> => {
  const valueType =
    typeof input.valueType === 'string' ? (input.valueType as WorkflowIOValueTypeEnum) : undefined;
  const document = await readWorkflowFile(context.dir);
  const currentVariable = document.chatConfig.variables?.find(
    (variable) => variable.key === input.key
  );
  const explicitType = normalizeVariableInputType(input.type);
  const inferredType = (() => {
    if (!valueType || !currentVariable?.valueType) return undefined;
    if (currentVariable.type !== getVariableInputType(currentVariable.valueType)) return undefined;
    return getVariableInputType(valueType);
  })();
  const type = explicitType ?? inferredType;
  const nextType = type ?? currentVariable?.type;
  const nextValueType = valueType ?? currentVariable?.valueType;
  if ((explicitType || valueType) && nextType && nextValueType) {
    assertVariableTypeCompatibility({ type: nextType, valueType: nextValueType });
  }
  if (input.required === true && nextType && specialOptionalTypes.has(nextType)) {
    throw new CliArgumentError('--required is not supported for this variable type', {
      type: nextType
    });
  }
  const required = (() => {
    const requested = getRequired(input);
    if (type && nextType && specialOptionalTypes.has(nextType)) return false;
    return requested;
  })();
  const config = await readVariableConfig(input, context);
  const patch: Partial<VariableItemType> = {
    ...config,
    key: typeof input.newKey === 'string' ? input.newKey : undefined,
    label: typeof input.label === 'string' ? input.label : undefined,
    description: typeof input.description === 'string' ? input.description : undefined,
    valueType,
    type,
    required,
    defaultValue: hasValueOption(input)
      ? await readInputValue({ input, context, valueType: nextValueType })
      : undefined
  };
  const cleanPatch = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined)
  ) as Partial<VariableItemType>;
  return runMutation({
    input,
    context,
    command: { type: 'variable.update', key: requireString(input, 'key'), patch: cleanPatch }
  });
};

export const removeVariable = async (
  input: Record<string, unknown>,
  context: CliContext
): Promise<CliResult> =>
  runMutation({
    input,
    context,
    command: { type: 'variable.remove', key: requireString(input, 'key') }
  });
