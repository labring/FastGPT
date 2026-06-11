import {
  NumberInput,
  NumberIncrementStepper,
  NumberInputField,
  NumberInputStepper,
  NumberDecrementStepper,
  type NumberInputProps,
  type NumberInputFieldProps
} from '@chakra-ui/react';
import React from 'react';
import MyIcon from '../../Icon';
import { type UseFormRegister } from 'react-hook-form';

type Props = Omit<NumberInputProps, 'onChange' | 'onBlur'> & {
  onChange?: (e?: number) => any;
  onBlur?: (e?: number) => any;
  placeholder?: string;
  register?: UseFormRegister<any>;
  name?: string;
  inputFieldProps?: NumberInputFieldProps;
  hideStepper?: boolean;
};

const MyNumberInput = (props: Props) => {
  const {
    register,
    name,
    onChange,
    onBlur,
    placeholder,
    inputFieldProps,
    hideStepper = false,
    ...restProps
  } = props;

  return (
    <NumberInput
      {...restProps}
      onBlur={(e) => {
        const numE = e.target.value === '' ? NaN : Number(e.target.value);
        if (onBlur) {
          onBlur(numE);
        }
        if (onChange) {
          onChange(numE);
        }
        if (register && name) {
          register(name).onBlur({
            target: {
              name,
              value: numE
            }
          });
        }
      }}
      onChange={(e) => {
        const numE = e === '' ? NaN : Number(e);
        if (onChange) {
          onChange(numE);
        }
        if (register && name) {
          register(name).onChange({
            target: {
              name,
              value: numE
            }
          });
        }
      }}
    >
      <NumberInputField
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
        {...inputFieldProps}
      />
      {!hideStepper && (
        <NumberInputStepper>
          <NumberIncrementStepper>
            <MyIcon name={'core/chat/chevronUp'} width={'12px'} />
          </NumberIncrementStepper>
          <NumberDecrementStepper>
            <MyIcon name={'core/chat/chevronDown'} width={'12px'} />
          </NumberDecrementStepper>
        </NumberInputStepper>
      )}
    </NumberInput>
  );
};

export default React.memo(MyNumberInput);
