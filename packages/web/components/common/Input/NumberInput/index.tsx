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

  const getRegisteredValue = (value: unknown) => {
    const safeValue = getSafeNumberValue(value);

    if (typeof safeValue === 'number') {
      return safeValue;
    }

    return '';
  };

  return (
    <NumberInput
      {...restProps}
      {...(typeof value !== 'undefined' ? { value: safeControlledValue } : {})}
      onBlur={(e) => {
        const numE = getSafeNumberValue(e.target.value);
        onBlur?.(numE);
        onChange?.(numE);

        if (registeredField && name) {
          const registeredValue = getRegisteredValue(e.target.value);
          const target = {
            name,
            value: registeredValue
          };
          registeredField.onChange({
            target,
            type: 'change'
          });
          registeredField.onBlur({
            target,
            type: 'blur'
          });
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
