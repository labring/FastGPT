import type { VariableItemType } from '../type';

export const getEvaluationFileHeader = (appVariables?: VariableItemType[]) => {
  if (!appVariables || appVariables.length === 0) return '*q,*a,history';

  const variablesStr = appVariables
    .map((item) => (item.required ? `*${item.key}` : item.key))
    .join(',');
  return `${variablesStr},*q,*a,history`;
};
