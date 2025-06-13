import React, { useMemo } from 'react';
import type { RenderInputProps } from '../type';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '@/pageComponents/app/detail/WorkflowComponents/context';
import MyNumberInput from '@fastgpt/web/components/common/Input/NumberInput';

const NumberInputRender = ({ item, nodeId }: RenderInputProps) => {
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);

  const Render = useMemo(() => {
    return (
      <MyNumberInput
        value={item.value}
        min={item.min}
        max={item.max}
        inputFieldProps={{ bg: 'white' }}
        rounded={'md'}
        onChange={(e) => {
          onChangeNode({
            nodeId,
            type: 'updateInput',
            key: item.key,
            value: {
              ...item,
              value: e
            }
          });
        }}
      />
    );
  }, [item, nodeId, onChangeNode]);

  return Render;
};

export default React.memo(NumberInputRender);
