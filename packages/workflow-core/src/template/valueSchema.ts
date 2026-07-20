import { WorkflowCommandError } from '../domain/diagnostic';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';

type JsonSchema = {
  type?: string;
  required?: string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  enum?: unknown[];
  additionalProperties?: boolean;
};

export const inputValueNeedsSchema = ({
  value,
  valueType
}: {
  value: unknown;
  valueType?: string;
}) =>
  valueType === WorkflowIOValueTypeEnum.object ||
  valueType === WorkflowIOValueTypeEnum.arrayObject ||
  valueType === WorkflowIOValueTypeEnum.arrayAny ||
  valueType === WorkflowIOValueTypeEnum.selectDataset ||
  valueType === WorkflowIOValueTypeEnum.selectApp ||
  (valueType === WorkflowIOValueTypeEnum.any && typeof value === 'object' && value !== null);

export const valueMatchesSchema = (value: unknown, schema: Record<string, unknown>): boolean => {
  const parsedSchema = schema as JsonSchema;
  if (parsedSchema.enum && !parsedSchema.enum.some((item) => Object.is(item, value))) return false;
  if (parsedSchema.type === 'string' && typeof value !== 'string') return false;
  if (parsedSchema.type === 'number' && typeof value !== 'number') return false;
  if (parsedSchema.type === 'integer' && (!Number.isInteger(value) || typeof value !== 'number'))
    return false;
  if (parsedSchema.type === 'boolean' && typeof value !== 'boolean') return false;
  if (parsedSchema.type === 'array') {
    if (!Array.isArray(value)) return false;
    return (
      !parsedSchema.items ||
      value.every((item) => valueMatchesSchema(item, parsedSchema.items as Record<string, unknown>))
    );
  }
  if (parsedSchema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    if (parsedSchema.required?.some((key) => record[key] === undefined)) return false;
    if (
      parsedSchema.additionalProperties === false &&
      Object.keys(record).some((key) => !parsedSchema.properties?.[key])
    ) {
      return false;
    }
    return Object.entries(parsedSchema.properties ?? {}).every(
      ([key, itemSchema]) =>
        record[key] === undefined ||
        valueMatchesSchema(record[key], itemSchema as Record<string, unknown>)
    );
  }
  return true;
};

/** 校验 Automation Metadata 提供的 JSON Schema 子集。 */
export const assertValueSchema = ({
  value,
  schema,
  nodeId,
  inputKey
}: {
  value: unknown;
  schema: Record<string, unknown>;
  nodeId: string;
  inputKey: string;
}) => {
  if (!valueMatchesSchema(value, schema)) {
    throw new WorkflowCommandError([
      {
        code: 'WORKFLOW_INPUT_VALUE_SCHEMA_INVALID',
        severity: 'error',
        nodeId,
        inputKey
      }
    ]);
  }
};
