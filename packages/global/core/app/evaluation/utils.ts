import type { VariableItemType } from '../type';

export const getEvaluationFileHeader = (
  appVariables?: VariableItemType[]
): string => {
  const defaultColumns = ['*q', '*a', 'history'];

  if (!appVariables || appVariables.length === 0) {
    return defaultColumns.join(',');
  }

  const variableColumns = appVariables.map((v) => (v.required ? `*${v.key}` : v.key));

  return [...variableColumns, ...defaultColumns].join(',');
};
