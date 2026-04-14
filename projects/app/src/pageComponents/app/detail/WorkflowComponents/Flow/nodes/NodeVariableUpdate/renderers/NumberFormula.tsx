import React from 'react';
import { Flex, Box } from '@chakra-ui/react';
import MySelect from '@fastgpt/web/components/common/MySelect';
import InputRender from '@/components/core/app/formRender';
import { InputTypeEnum } from '@/components/core/app/formRender/constant';
import type { TUpdateListItem } from '@fastgpt/global/core/workflow/template/system/variableUpdate/type';

type NumberOperator = NonNullable<TUpdateListItem['numberOperator']>;

// 运算符：存储用 ASCII，展示用数学符号
const OPERATORS: { value: NumberOperator; label: string }[] = [
  { value: '=', label: '=' },
  { value: '+', label: '+' },
  { value: '-', label: '−' },
  { value: '*', label: '×' },
  { value: '/', label: '÷' }
];

type Props = {
  operator?: NumberOperator;
  value: unknown;
  variables: any[];
  variableLabels: any[];
  onChange: (patch: { operator?: NumberOperator; value?: unknown }) => void;
};

const NumberFormula = ({ operator = '=', value, variables, variableLabels, onChange }: Props) => {
  return (
    <Flex gap={2} alignItems={'center'}>
      <Box flexShrink={0} w={'80px'}>
        <MySelect<NumberOperator>
          size={'sm'}
          list={OPERATORS}
          value={operator}
          onChange={(v) => onChange({ operator: v })}
        />
      </Box>
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
