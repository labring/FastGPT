import React from 'react';
import { Box } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MySelect from '@fastgpt/web/components/common/MySelect';
import InputRender from '@/components/core/app/formRender';
import { InputTypeEnum } from '@/components/core/app/formRender/constant';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import type { TUpdateListItem } from '@fastgpt/global/core/workflow/template/system/variableUpdate/type';
import type { ReferenceValueType } from '@fastgpt/global/core/workflow/type/io';

type Mode = NonNullable<TUpdateListItem['arrayMode']>;

// 元素类型对应的 InputRender 类型
const elementInputTypeFor = (valueType?: WorkflowIOValueTypeEnum): InputTypeEnum => {
  switch (valueType) {
    case WorkflowIOValueTypeEnum.arrayString:
      return InputTypeEnum.textarea; // PromptEditor，带 `/` 变量选择
    case WorkflowIOValueTypeEnum.arrayNumber:
      return InputTypeEnum.numberInput;
    case WorkflowIOValueTypeEnum.arrayBoolean:
      return InputTypeEnum.switch;
    case WorkflowIOValueTypeEnum.arrayObject:
      return InputTypeEnum.JSONEditor;
    default:
      return InputTypeEnum.textarea;
  }
};

type Props = {
  valueType?: WorkflowIOValueTypeEnum;
  arrayMode?: TUpdateListItem['arrayMode'];
  value?: ReferenceValueType;
  variables: any[];
  variableLabels: any[];
  onChange: (patch: Partial<TUpdateListItem>) => void;
};

const ArrayValue = ({
  valueType,
  arrayMode,
  value,
  variables,
  variableLabels,
  onChange
}: Props) => {
  const { t } = useTranslation();
  const mode: Mode = arrayMode ?? 'equal';

  const modeList: { value: Mode; label: string }[] = [
    { value: 'equal', label: t('workflow:var_update_array_equal') },
    { value: 'append', label: t('workflow:var_update_array_append') },
    { value: 'clear', label: t('workflow:var_update_array_clear') }
  ];

  const onInputChange = (v: unknown) => {
    onChange({ value: ['', v] as ReferenceValueType });
  };

  const body = (() => {
    if (mode === 'clear') return null;

    // equal：整数组 JSONEditor；append：单元素对应 InputRender
    const inputType = mode === 'equal' ? InputTypeEnum.JSONEditor : elementInputTypeFor(valueType);

    return (
      <InputRender
        inputType={inputType}
        variables={variables}
        variableLabels={variableLabels}
        value={value?.[1]}
        onChange={onInputChange}
      />
    );
  })();

  return (
    <Box>
      <Box mb={2}>
        <MySelect<Mode>
          size={'sm'}
          list={modeList}
          value={mode}
          onChange={(m) => onChange({ arrayMode: m, value: undefined })}
        />
      </Box>
      {body}
    </Box>
  );
};

export default ArrayValue;
