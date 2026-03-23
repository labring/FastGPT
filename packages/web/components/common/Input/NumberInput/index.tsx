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

const getSafeNumberValue = (value: unknown) => {
  if (value === '' || value === null || value === undefined) {
    return undefined;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === 'string') {
    const trimmedValue = value.trim();
    if (!trimmedValue) {
      return undefined;
    }

    const parsedValue = Number(trimmedValue);
    return Number.isFinite(parsedValue) ? parsedValue : undefined;
  }

  return undefined;
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
    value,
    ...restProps
  } = props;

  const registeredField =
    register && name
      ? register(name, {
          required: props.isRequired,
          min: props.min,
          max: props.max,
          setValueAs: (value) => getSafeNumberValue(value)
        })
      : undefined;
  const inputFieldRegisterProps = registeredField
    ? {
        name: registeredField.name,
        ref: registeredField.ref
      }
    : undefined;

  const safeControlledValue =
    value === '' ? '' : typeof value === 'undefined' ? undefined : getSafeNumberValue(value) ?? '';

  return (
    <NumberInput
      {...restProps}
      {...(typeof value !== 'undefined' ? { value: safeControlledValue } : {})}
      onBlur={(e) => {
        const numE = getSafeNumberValue(e.target.value);
        if (onBlur) {
          onBlur(numE);
        }
        if (onChange) {
          onChange(numE);
        }
        if (registeredField && name) {
          const event = {
            target: {
              name
            },
            type: 'blur'
          };
          registeredField.onBlur(event);
        }
      }}
      onChange={(e) => {
        const numE =
          e === '' ? '' : e.endsWith('.') || /^\d+\.0+$/.test(e) ? e : getSafeNumberValue(e) ?? '';
        if (onChange) {
          onChange(typeof numE === 'string' ? getSafeNumberValue(numE) : numE);
        }
        if (registeredField && name) {
          const event = {
            target: {
              name,
              value: numE
            }
          };

          registeredField.onChange(event);
        }
      }}
    >
      <NumberInputField
        placeholder={placeholder}
        h={restProps.h}
        defaultValue={restProps.defaultValue}
        {...(inputFieldRegisterProps || {})}
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
