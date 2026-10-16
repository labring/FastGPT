import {
  option,
  emptySchema,
  valueOptionShape,
  valueOptions,
  getValueOptionCount
} from '../commandOptions';
import z, { ZodError } from 'zod';
import {
  VariableItemTypeSchema,
  type VariableItemType
} from '@fastgpt/global/core/app/variable/type';
import {
  VariableInputEnum,
  WorkflowIOValueTypeEnum,
  textInputVariableValueTypes,
  variableMap
} from '@fastgpt/global/core/workflow/constants';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { CliArgumentError } from '../error';
import { readWorkflowFile } from '../io/workflowFile';
import type { CliContext, CliResult, CliCommandDefinition } from '../type';
import { readInputValue, requireString, runMutation } from './helpers';
const variableTypeSchema = z.enum([...Object.values(VariableInputEnum), 'external']);
const variableConfigOptionShape = {
  configJson: z.string().min(1).optional(),
  configFile: z.string().min(1).optional(),
  optionsJson: z.string().min(1).optional(),
  min: z.string().min(1).optional(),
  max: z.string().min(1).optional(),
  maxLength: z.string().min(1).optional(),
  timeGranularity: z.enum(['day', 'hour', 'minute', 'second']).optional()
};
const variableConfigOptions = [
  option('--config-json', 'Type-specific variable config as JSON'),
  option('--config-file', 'Read type-specific variable config from a JSON file'),
  option('--options-json', 'Select options as a JSON array'),
  option('--min', 'Minimum numeric value'),
  option('--max', 'Maximum numeric value'),
  option('--max-length', 'Maximum text length'),
  option('--time-granularity', 'Time granularity: day, hour, minute or second')
];
const getVariableConfigFileOptionCount = (value: Record<string, unknown>) =>
  [value.configJson, value.configFile].filter((item) => item !== undefined).length;

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

/** variable 命令定义与执行逻辑在同一模块维护；注册器只负责收集。 */
export const variableCommands: CliCommandDefinition[] = [
  {
    path: ['variable', 'list'],
    introducedIn: 'PR2',
    kind: 'query',
    inputSchema: emptySchema,
    options: [],
    supportsDryRun: false,
    confirm: 'none',
    handler: listVariables
  },
  {
    path: ['variable', 'add'],
    introducedIn: 'PR2',
    kind: 'localMutation',
    inputSchema: z
      .object({
        key: z.string().min(1),
        type: variableTypeSchema.optional(),
        valueType: z.enum(WorkflowIOValueTypeEnum),
        label: z.string().min(1).optional(),
        description: z.string().optional(),
        required: z.literal(true).optional(),
        ...variableConfigOptionShape,
        ...valueOptionShape,
        dryRun: z.literal(true).optional()
      })
      .strict()
      .superRefine((value, context) => {
        if (getValueOptionCount(value) > 1) {
          context.addIssue({ code: 'custom', message: 'Value options are exclusive' });
        }
        if (getVariableConfigFileOptionCount(value) > 1) {
          context.addIssue({ code: 'custom', message: 'Config options are exclusive' });
        }
      }),
    options: [
      option('--key', 'Variable key', { required: true }),
      option('--type', 'Variable input type; external is an alias for custom'),
      option('--value-type', 'Workflow value type', { required: true }),
      option('--label', 'Variable label'),
      option('--description', 'Variable description'),
      option('--required', 'Mark the variable as required', { value: false }),
      ...variableConfigOptions,
      ...valueOptions,
      option('--dry-run', 'Return changes without writing', { value: false })
    ],
    supportsDryRun: true,
    confirm: 'none',
    handler: addVariable
  },
  {
    path: ['variable', 'update'],
    introducedIn: 'PR2',
    kind: 'localMutation',
    inputSchema: z
      .object({
        key: z.string().min(1),
        newKey: z.string().min(1).optional(),
        type: variableTypeSchema.optional(),
        valueType: z.enum(WorkflowIOValueTypeEnum).optional(),
        label: z.string().min(1).optional(),
        description: z.string().optional(),
        required: z.literal(true).optional(),
        optional: z.literal(true).optional(),
        ...variableConfigOptionShape,
        ...valueOptionShape,
        dryRun: z.literal(true).optional()
      })
      .strict()
      .superRefine((value, context) => {
        if (value.required && value.optional) {
          context.addIssue({ code: 'custom', message: '--required and --optional are exclusive' });
        }
        if (getValueOptionCount(value) > 1) {
          context.addIssue({ code: 'custom', message: 'Value options are exclusive' });
        }
        if (getVariableConfigFileOptionCount(value) > 1) {
          context.addIssue({ code: 'custom', message: 'Config options are exclusive' });
        }
        if (
          [
            value.newKey,
            value.type,
            value.valueType,
            value.label,
            value.description,
            value.required,
            value.optional,
            value.configJson,
            value.configFile,
            value.optionsJson,
            value.min,
            value.max,
            value.maxLength,
            value.timeGranularity,
            value.value,
            value.valueJson,
            value.valueFile,
            value.valueEnv
          ].every((item) => item === undefined)
        ) {
          context.addIssue({ code: 'custom', message: 'At least one update field is required' });
        }
      }),
    options: [
      option('--key', 'Existing variable key', { required: true }),
      option('--new-key', 'New variable key'),
      option('--type', 'Variable input type; external is an alias for custom'),
      option('--value-type', 'Workflow value type'),
      option('--label', 'Variable label'),
      option('--description', 'Variable description'),
      option('--required', 'Mark the variable as required', { value: false }),
      option('--optional', 'Mark the variable as optional', { value: false }),
      ...variableConfigOptions,
      ...valueOptions,
      option('--dry-run', 'Return changes without writing', { value: false })
    ],
    supportsDryRun: true,
    confirm: 'none',
    handler: updateVariable
  },
  {
    path: ['variable', 'remove'],
    introducedIn: 'PR2',
    kind: 'localMutation',
    inputSchema: z.object({ key: z.string().min(1), dryRun: z.literal(true).optional() }).strict(),
    options: [
      option('--key', 'Variable key', { required: true }),
      option('--dry-run', 'Return changes without writing', { value: false })
    ],
    supportsDryRun: true,
    confirm: 'none',
    handler: removeVariable
  }
];
