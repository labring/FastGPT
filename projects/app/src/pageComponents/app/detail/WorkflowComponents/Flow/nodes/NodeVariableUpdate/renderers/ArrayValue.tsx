import React from 'react';
import { Box, Flex } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MySelect from '@fastgpt/web/components/common/MySelect';
import InputRender from '@/components/core/app/formRender';
import { InputTypeEnum } from '@/components/core/app/formRender/constant';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import type { TUpdateListItem } from '@fastgpt/global/core/workflow/template/system/variableUpdate/type';
import type { ReferenceValueType } from '@fastgpt/global/core/workflow/type/io';
import type {
  EditorVariableLabelPickerType,
  EditorVariablePickerType
} from '@fastgpt/web/components/common/Textarea/PromptEditor/type';

type Mode = NonNullable<TUpdateListItem['arrayMode']>;

// 元素类型对应的 InputRender 类型
const elementInputTypeFor = (valueType?: WorkflowIOValueTypeEnum): InputTypeEnum => {
  switch (valueType) {
    case WorkflowIOValueTypeEnum.arrayString:
      return InputTypeEnum.textarea; // PromptEditor，带 `/` 变量选择
    case WorkflowIOValueTypeEnum.arrayNumber:
      return InputTypeEnum.numberInput;
    case WorkflowIOValueTypeEnum.arrayObject:
      return InputTypeEnum.JSONEditor;
    default:
      return InputTypeEnum.textarea;
  }
};

// 元素类型是否可以与模式下拉同行展示
const isInlineElementType = (valueType?: WorkflowIOValueTypeEnum) =>
  valueType === WorkflowIOValueTypeEnum.arrayNumber ||
  valueType === WorkflowIOValueTypeEnum.arrayBoolean;

type Props = {
  valueType?: WorkflowIOValueTypeEnum;
  arrayMode?: TUpdateListItem['arrayMode'];
  value?: ReferenceValueType;
  variables: EditorVariablePickerType[];
  variableLabels: EditorVariableLabelPickerType[];
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

  const modeSelect = (
    <MySelect<Mode>
      width={'126px'}
      h={10}
      flexShrink={0}
      list={modeList}
      value={mode}
      onChange={(m) => onChange({ arrayMode: m, value: undefined })}
    />
  );

  // append + 数字/布尔：与模式同行展示元素输入
  if (mode === 'append' && isInlineElementType(valueType)) {
    if (valueType === WorkflowIOValueTypeEnum.arrayBoolean) {
      type BoolStr = 'true' | 'false';
      const boolList: { value: BoolStr; label: string }[] = [
        { value: 'true', label: 'True' },
        { value: 'false', label: 'False' }
      ];
      const current: BoolStr = (value?.[1] as unknown) === false ? 'false' : 'true';
      return (
        <Flex gap={2} alignItems={'center'}>
          {modeSelect}
          <Box flex={1} w={0}>
            <MySelect<BoolStr>
              h={10}
              list={boolList}
              value={current}
              onChange={(v) => onInputChange(v === 'true')}
            />
          </Box>
        </Flex>
      );
    }
    // arrayNumber
    return (
      <Flex gap={2} alignItems={'center'}>
        {modeSelect}
        <Box flex={1} w={0}>
          <InputRender
            inputType={InputTypeEnum.numberInput}
            variables={variables}
            variableLabels={variableLabels}
            value={value?.[1]}
            onChange={onInputChange}
          />
        </Box>
      </Flex>
    );
  }

  if (mode === 'clear') {
    return modeSelect;
  }

  // equal：整数组 JSONEditor；append 的字符串/对象：独占一行
  const inputType = mode === 'equal' ? InputTypeEnum.JSONEditor : elementInputTypeFor(valueType);

  return (
    <Box>
      <Box mb={2}>{modeSelect}</Box>
      <InputRender
        inputType={inputType}
        variables={variables}
        variableLabels={variableLabels}
        value={value?.[1]}
        onChange={onInputChange}
      />
    </Box>
  );
};

export default ArrayValue;
