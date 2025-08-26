import { VariableInputEnum } from '@fastgpt/global/core/workflow/constants';
import type { VariableItemType } from '@fastgpt/global/core/app/type';
import { decryptSecret, encryptSecret } from '../../../common/secret/aes256gcm';

export const isEncryptedPassword = (value: string): boolean => {
  return typeof value === 'string' && value.includes(':') && value.split(':').length === 3;
};

export const decryptPasswordVariables = (
  variables: Record<string, any>,
  variableList?: VariableItemType[]
): Record<string, any> => {
  if (!variableList || !Array.isArray(variableList)) return variables;

  const result = { ...variables };
  variableList.forEach((variable) => {
    if (variable.type === VariableInputEnum.password && result[variable.key]) {
      const value = result[variable.key];

      if (typeof value === 'string' && value && isEncryptedPassword(value)) {
        try {
          result[variable.key] = decryptSecret(value);
        } catch (error) {
          console.warn(`Failed to decrypt password variable ${variable.key}:`, error);
          result[variable.key] = '';
        }
      }
    }
  });

  return result;
};

export const encryptPasswordVariables = (
  variables: Record<string, any>,
  variableList?: VariableItemType[]
): Record<string, any> => {
  if (!variableList || !Array.isArray(variableList)) return variables;

  const result = { ...variables };
  variableList.forEach((variable) => {
    if (variable.type === VariableInputEnum.password && result[variable.key]) {
      const value = result[variable.key];
      if (typeof value === 'string' && value) {
        try {
          result[variable.key] = encryptSecret(value);
        } catch (error) {
          console.warn(`Failed to encrypt password variable ${variable.key}:`, error);
          result[variable.key] = '';
        }
      }
    }
  });

  return result;
};
