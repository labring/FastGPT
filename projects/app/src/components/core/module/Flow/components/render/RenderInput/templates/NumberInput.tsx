import React from 'react';
import type { RenderInputProps } from '../type';
import {
  NumberDecrementStepper,
  NumberIncrementStepper,
  NumberInput,
  NumberInputField,
  NumberInputStepper
} from '@chakra-ui/react';
import { onChangeNode } from '../../../../FlowProvider';

const NumberInputRender = ({ item, moduleId }: RenderInputProps) => {
  return (
    <NumberInput
      defaultValue={item.value}
      min={item.min}
      max={item.max}
      onChange={(e) => {
        onChangeNode({
          moduleId,
          type: 'updateInput',
          key: item.key,
          value: {
            ...item,
            value: Number(e)
          }
        });
      }}
    >
      <NumberInputField />
      <NumberInputStepper>
        <NumberIncrementStepper />
        <NumberDecrementStepper />
      </NumberInputStepper>
    </NumberInput>
  );
};

export default React.memo(NumberInputRender);
