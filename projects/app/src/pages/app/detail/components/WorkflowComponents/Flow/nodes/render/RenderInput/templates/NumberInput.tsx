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
import MyIcon from '@fastgpt/web/components/common/Icon';

const NumberInputRender = ({ item, nodeId }: RenderInputProps) => {
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);

  const Render = useMemo(() => {
    return (
      <NumberInput
        defaultValue={item.value}
        min={item.min}
        max={item.max}
        bg={'white'}
        rounded={'md'}
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
        <NumberInputField
          bg={'white'}
          px={3}
          rounded={'md'}
          _hover={{
            borderColor: 'primary.500'
          }}
        />
        <NumberInputStepper roundedTopRight={'none'}>
          <NumberIncrementStepper
            borderTopRightRadius={'sm !important'}
            _hover={{
              bg: 'myGray.100'
            }}
          >
            <MyIcon name={'core/chat/chevronUp'} width={'12px'} />
          </NumberIncrementStepper>
          <NumberDecrementStepper
            borderBottomRightRadius={'sm !important'}
            _hover={{
              bg: 'myGray.100'
            }}
          >
            <MyIcon name={'core/chat/chevronDown'} width={'12px'} />
          </NumberDecrementStepper>
        </NumberInputStepper>
      </NumberInput>
    );
  }, [item, nodeId, onChangeNode]);

  return Render;
};

export default React.memo(NumberInputRender);
