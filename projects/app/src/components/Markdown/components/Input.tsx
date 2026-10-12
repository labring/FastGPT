import React from 'react';
import {
  Input as ChakraInput,
  Checkbox as ChakraCheckbox,
  Radio as ChakraRadio,
  type InputProps as ChakraInputProps
} from '@chakra-ui/react';

export type MarkdownInputProps = {
  node?: any;
  type?: string;
  value?: string | number;
  defaultValue?: string | number;
  checked?: boolean;
  defaultChecked?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  placeholder?: string;
} & ChakraInputProps;

/**
 * 基于 Chakra UI 的受控 Markdown <input> 渲染器
 * 自动识别并美化普通输入框、复选框 (checkbox) 与单选框 (radio)
 */
export const Input = ({
  node,
  type = 'text',
  value,
  defaultValue,
  checked,
  defaultChecked,
  disabled,
  readOnly,
  placeholder,
  ...props
}: MarkdownInputProps) => {
  // 复选框美化
  if (type === 'checkbox') {
    const isChecked = checked !== undefined ? checked : defaultChecked;
    return (
      <ChakraCheckbox
        isChecked={isChecked}
        isDisabled={disabled || readOnly}
        colorScheme={'primary'}
        mx={1}
        my={0.5}
        verticalAlign={'middle'}
      />
    );
  }

  // 单选框美化
  if (type === 'radio') {
    const isChecked = checked !== undefined ? checked : defaultChecked;
    return (
      <ChakraRadio
        isChecked={isChecked}
        isDisabled={disabled || readOnly}
        colorScheme={'primary'}
        mx={1}
        my={0.5}
        verticalAlign={'middle'}
      />
    );
  }

  // 普通文本与数字输入框美化
  return (
    <ChakraInput
      size={'sm'}
      type={type}
      defaultValue={defaultValue ?? value}
      placeholder={placeholder}
      isDisabled={disabled}
      isReadOnly={readOnly}
      borderRadius={'md'}
      bg={'white'}
      borderColor={'myGray.200'}
      _focus={{
        bg: 'white',
        borderColor: 'primary.500'
      }}
      maxW={'100%'}
      my={1}
      {...props}
    />
  );
};

export default React.memo(Input);
