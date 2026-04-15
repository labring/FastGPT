import React from 'react';
import { Flex, Box } from '@chakra-ui/react';
import MySelect from '@fastgpt/web/components/common/MySelect';
import MyIcon from '@fastgpt/web/components/common/Icon';
import type { IconNameType } from '@fastgpt/web/components/common/Icon/type';
import InputRender from '@/components/core/app/formRender';
import { InputTypeEnum } from '@/components/core/app/formRender/constant';
import type { TUpdateListItem } from '@fastgpt/global/core/workflow/template/system/variableUpdate/type';
import type {
  EditorVariableLabelPickerType,
  EditorVariablePickerType
} from '@fastgpt/web/components/common/Textarea/PromptEditor/type';

type NumberOperator = NonNullable<TUpdateListItem['numberOperator']>;

// 运算符：存储用 ASCII，展示用图标
const OPERATOR_ICONS: Record<NumberOperator, IconNameType> = {
  '=': 'math/equal',
  '+': 'math/plus',
  '-': 'math/minus',
  '*': 'math/times',
  '/': 'math/divide'
};

const OPERATORS: { value: NumberOperator; label: React.ReactNode }[] = (
  ['=', '+', '-', '*', '/'] as NumberOperator[]
).map((op) => ({
  value: op,
  label: <MyIcon name={OPERATOR_ICONS[op]} w={'1rem'} color={'myGray.700'} />
}));

type Props = {
  operator?: NumberOperator;
  value: unknown;
  variables: EditorVariablePickerType[];
  variableLabels: EditorVariableLabelPickerType[];
  onChange: (patch: { operator?: NumberOperator; value?: unknown }) => void;
};

const NumberFormula = ({ operator = '=', value, variables, variableLabels, onChange }: Props) => {
  return (
    <Flex gap={2} alignItems={'center'}>
      <MySelect<NumberOperator>
        width={'126px'}
        h={10}
        flexShrink={0}
        list={OPERATORS}
        value={operator}
        onChange={(v) => onChange({ operator: v })}
      />
      <Box flex={1} w={0}>
        <InputRender
          inputType={InputTypeEnum.numberInput}
          value={value as any}
          onChange={(v) => onChange({ value: v })}
          variables={variables}
          variableLabels={variableLabels}
        />
      </Box>
    </Flex>
  );
};

export default NumberFormula;
