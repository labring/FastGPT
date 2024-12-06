import {
  NumberInput,
  NumberIncrementStepper,
  NumberInputField,
  NumberInputStepper,
  NumberDecrementStepper,
  NumberInputProps
} from '@chakra-ui/react';
import React from 'react';
import MyIcon from '../../Icon';
import { UseFormRegister } from 'react-hook-form';

type Props = Omit<NumberInputProps, 'onChange'> & {
  onChange?: (e?: number) => any;
  placeholder?: string;
  register?: UseFormRegister<any>;
  name?: string;
  bg?: string;
};

const MyNumberInput = (props: Props) => {
  const { register, name, onChange, placeholder, bg, ...restProps } = props;

  return (
    <NumberInput
      {...restProps}
      onChange={(e) => {
        if (!onChange) return;
        if (e === '') {
          // @ts-ignore
          onChange('');
        } else {
          onChange(Number(e));
        }
      }}
    >
      <NumberInputField
        bg={bg}
        placeholder={placeholder}
        {...(register && name
          ? register(name, {
              required: props.isRequired,
              min: props.min,
              max: props.max
            })
          : {})}
      />
      <NumberInputStepper>
        <NumberIncrementStepper>
          <MyIcon name={'core/chat/chevronUp'} width={'12px'} />
        </NumberIncrementStepper>
        <NumberDecrementStepper>
          <MyIcon name={'core/chat/chevronDown'} width={'12px'} />
        </NumberDecrementStepper>
      </NumberInputStepper>
    </NumberInput>
  );
};

export default MyNumberInput;
