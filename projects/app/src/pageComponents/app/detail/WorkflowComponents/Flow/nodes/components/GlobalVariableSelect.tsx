import React, { useMemo } from 'react';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { VARIABLE_NODE_ID } from '@fastgpt/global/core/workflow/constants';
import type { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { areWorkflowValueTypesCompatible } from '@fastgpt/global/common/workflow/reference';
import { isGlobalVariableReferenceValue } from '@fastgpt/global/core/app/tool/toolSet/utils';
import type { EditorVariableLabelPickerType } from '@fastgpt/web/components/common/Textarea/PromptEditor/type';
import type { EditorVariablePickerType } from '@fastgpt/global/core/workflow/type/io';

/** 全局变量在提示词编辑器中的 `/` 插入项。 */
export const useGlobalVariableLabels = (globalVariables: EditorVariablePickerType[]) => {
  const { t } = useSafeTranslation();
  return useMemo<EditorVariableLabelPickerType[]>(
    () =>
      globalVariables.map((variable) => ({
        key: variable.key,
        label: t(variable.label as any),
        required: variable.required,
        icon: variable.icon,
        valueType: variable.valueType,
        parent: {
          id: VARIABLE_NODE_ID,
          label: t('common:core.module.Variable')
        }
      })),
    [globalVariables, t]
  );
};

/**
 * 全局变量选择器。
 * 值统一保存为 `[VARIABLE_NODE_ID, variableKey]`，与工作流引用格式一致。
 */
const GlobalVariableSelect = ({
  value,
  valueType,
  globalVariables,
  onChange,
  width = '200px'
}: {
  value?: unknown;
  valueType?: WorkflowIOValueTypeEnum;
  globalVariables: EditorVariablePickerType[];
  onChange: (value: [typeof VARIABLE_NODE_ID, string] | undefined) => void;
  width?: string;
}) => {
  const { t } = useSafeTranslation();
  const selectedKey = isGlobalVariableReferenceValue(value) ? value[1] : undefined;
  const compatibleVariables = globalVariables.filter((variable) =>
    areWorkflowValueTypesCompatible({ expected: valueType, actual: variable.valueType })
  );
  const missingVariable =
    selectedKey && !compatibleVariables.some((variable) => variable.key === selectedKey)
      ? selectedKey
      : undefined;

  return (
    <MySelect
      size={'sm'}
      w={width}
      flexShrink={0}
      bg={'white'}
      value={selectedKey}
      valueLabel={selectedKey ? undefined : t('common:select_reference_variable')}
      list={[
        ...compatibleVariables.map((variable) => ({
          label: t(variable.label as any),
          value: variable.key
        })),
        ...(missingVariable ? [{ label: missingVariable, value: missingVariable }] : [])
      ]}
      onChange={(variableKey) => {
        if (!variableKey) {
          onChange(undefined);
          return;
        }
        onChange([VARIABLE_NODE_ID, String(variableKey)]);
      }}
    />
  );
};

export default React.memo(GlobalVariableSelect);
