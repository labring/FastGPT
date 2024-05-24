import {
  NumberInput,
  NumberIncrementStepper,
  NumberInputField,
  NumberInputStepper,
  NumberDecrementStepper,
  NumberInputProps
} from '@chakra-ui/react';
import React from 'react';

type Props = Omit<NumberInputProps, 'onChange'> & {
  onChange: (e: number | '') => any;
  placeholder?: string;
};

const MyNumberInput = (props: Props) => {
  return (
    <NumberInput
      {...props}
      onChange={(e) => {
        if (isNaN(Number(e))) {
          props?.onChange('');
        } else {
          props?.onChange(Number(e));
        }
      }}
    >
      <NumberInputField placeholder={props?.placeholder} />
      <NumberInputStepper>
        <NumberIncrementStepper />
        <NumberDecrementStepper />
      </NumberInputStepper>
    </NumberInput>
  );
};

export default MyNumberInput;
