import React, { useMemo } from 'react';
import type { RenderInputProps } from '../type';
import {
  NumberDecrementStepper,
  NumberIncrementStepper,
  NumberInput,
  NumberInputField,
  NumberInputStepper
} from '@chakra-ui/react';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '@/pages/app/detail/components/WorkflowComponents/context';

const NumberInputRender = ({ item, nodeId }: RenderInputProps) => {
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);

  const Render = useMemo(() => {
    return (
      <NumberInput
        defaultValue={item.value}
        min={item.min}
        max={item.max}
        onChange={(e) => {
          onChangeNode({
            nodeId,
            type: 'updateInput',
            key: item.key,
            value: {
              ...item,
              value: Number(e)
            }
          });
        }}
      >
        <NumberInputField bg={'white'} px={3} borderRadius={'sm'} />
        <NumberInputStepper>
          <NumberIncrementStepper />
          <NumberDecrementStepper />
        </NumberInputStepper>
      </NumberInput>
    );
  }, [item, nodeId, onChangeNode]);

  return Render;
};

export default React.memo(NumberInputRender);
