import z from 'zod';
import type { CliOptionDefinition } from './type';

export const option = (
  name: string,
  description: string,
  config: Partial<Pick<CliOptionDefinition, 'value' | 'required'>> = {}
): CliOptionDefinition => ({
  name,
  description,
  value: config.value ?? true,
  required: config.required
});

export const emptySchema = z.object({}).strict();

export const valueOptionShape = {
  value: z.string().optional(),
  valueJson: z.string().optional(),
  valueFile: z.string().optional(),
  valueEnv: z.string().optional()
};

export const valueOptions = [
  option('--value', 'Scalar value'),
  option('--value-json', 'JSON value'),
  option('--value-file', 'Read a UTF-8 value from a file'),
  option('--value-env', 'Read a value from an environment variable')
];

export const getValueOptionCount = (value: Record<string, unknown>) =>
  [value.value, value.valueJson, value.valueFile, value.valueEnv].filter(
    (item) => item !== undefined
  ).length;
