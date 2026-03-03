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
        const numE = e.target.value === '' ? '' : Number(e.target.value);
        if (onBlur) {
          if (numE === '') {
            // @ts-ignore
            onBlur('');
          } else {
            onBlur(numE);
          }
        }
        if (onChange) {
          if (numE === '') {
            // @ts-ignore
            onChange('');
          } else {
            onChange(numE);
          }
        }
        if (register && name) {
          const event = {
            target: {
              name,
              value: numE
            }
          };
          register(name).onBlur(event);
        }
      }}
      onChange={(e) => {
        const numE = e === '' ? '' : e.endsWith('.') || /^\d+\.0+$/.test(e) ? e : Number(e);
        if (onChange) {
          if (numE === '') {
            // @ts-ignore
            onChange('');
          } else {
            // @ts-ignore
            onChange(numE);
          }
        }
        if (register && name) {
          const event = {
            target: {
              name,
              value: numE
            }
          };

          register(name).onChange(event);
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
