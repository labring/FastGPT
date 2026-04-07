import { useToast } from '@fastgpt/web/hooks/useToast';
import { useTranslation } from 'next-i18next';
import { useCallback } from 'react';
import {
  validateVariableIdentifier,
  workflowVariableReservedKeys
} from '@fastgpt/global/core/app/variableIdentifier';

export const useValidateFieldName = () => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const validateFieldName = useCallback(
    (
      label: string,
      options: {
        existingKeys: string[];
        systemVariables?: { key: string; label: string }[];
        currentKey?: string;
      }
    ) => {
      const { existingKeys, systemVariables = [], currentKey } = options;

      // 1. 检查是否为空
      const trimmedLabel = label?.trim();
      if (!trimmedLabel) {
        toast({
          status: 'warning',
          title: t('app:variable_name_required')
        });
        return false;
      }

      // 2. 检查是否与现有字段重复（排除自身）
      const isDuplicate = existingKeys.some((key) => {
        return key !== currentKey && trimmedLabel === key;
      });

      if (isDuplicate) {
        toast({
          status: 'warning',
          title: t('workflow:field_name_already_exists')
        });
        return false;
      }

      // 3. 检查是否与系统变量冲突（如果提供了系统变量列表）
      if (systemVariables.length > 0) {
        const isSystemConflict = systemVariables.some(
          (item) => item.key === trimmedLabel || t(item.label as any) === trimmedLabel
        );

        if (isSystemConflict) {
          toast({
            status: 'warning',
            title: t('app:systemval_conflict_globalval')
          });
          return false;
        }
      }

      return true;
    },
    [t, toast]
  );

  return validateFieldName;
};

export const useValidateFieldKey = () => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const validateFieldKey = useCallback(
    (
      key: string,
      options?: {
        existingKeys?: string[];
        reservedKeys?: readonly string[];
        currentKey?: string;
      }
    ) => {
      const result = validateVariableIdentifier(key, {
        reservedKeys: workflowVariableReservedKeys,
        ...options
      });

      if (result.valid) return true;

      const titleMap = {
        required: t('app:variable_key_required'),
        invalid_format: t('app:variable_key_invalid'),
        duplicate: t('workflow:field_name_already_exists'),
        system_conflict: t('app:variable_key_system_conflict')
      } as const;

      toast({
        status: 'warning',
        title: titleMap[result.reason]
      });

      return false;
    },
    [t, toast]
  );

  return validateFieldKey;
};

export const useSubmitErrorHandler = () => {
  const { toast } = useToast();

  const onSubmitError = useCallback(
    (errors: Record<string, any>) => {
      const firstError = Object.values(errors).find((error) => error?.message);
      if (firstError) {
        toast({
          status: 'warning',
          title: firstError.message
        });
      }
    },
    [toast]
  );

  return onSubmitError;
};
