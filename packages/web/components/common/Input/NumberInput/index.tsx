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

type Props = Omit<NumberInputProps, 'onChange' | 'onBlur'> & {
  onChange?: (e?: number) => any;
  onBlur?: (e?: number) => any;
  placeholder?: string;
  register?: UseFormRegister<any>;
  name?: string;
  bg?: string;
};

const MyNumberInput = (props: Props) => {
  const { register, name, onChange, onBlur, placeholder, bg, ...restProps } = props;

  return (
    <NumberInput
      {...restProps}
      onBlur={(e) => {
        if (!onBlur) return;
        const numE = Number(e.target.value);
        if (isNaN(numE)) {
          // @ts-ignore
          onBlur('');
        } else {
          onBlur(numE);
        }
      }}
      onChange={(e) => {
        if (!onChange) return;
        const numE = Number(e);
        if (isNaN(numE)) {
          // @ts-ignore
          onChange('');
        } else {
          onChange(numE);
        }
      }}
    >
      <NumberInputField
        bg={bg}
        placeholder={placeholder}
        h={restProps.h}
        defaultValue={restProps.defaultValue}
        {...(register && name
          ? register(name, {
              required: props.isRequired,
              min: props.min,
              max: props.max,
              valueAsNumber: true
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

export default React.memo(MyNumberInput);
