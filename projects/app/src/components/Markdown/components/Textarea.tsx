import React from 'react';
import {
  Textarea as ChakraTextarea,
  type TextareaProps as ChakraTextareaProps
} from '@chakra-ui/react';

export type MarkdownTextareaProps = {
  node?: any;
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  readOnly?: boolean;
  children?: React.ReactNode;
} & ChakraTextareaProps;

/**
 * 基于 Chakra UI 的受控 Markdown <textarea> 多行文本渲染器
 */
export const Textarea = ({
  node,
  value,
  defaultValue,
  placeholder,
  rows = 3,
  disabled,
  readOnly,
  children,
  ...props
}: MarkdownTextareaProps) => {
  const initialValue =
    defaultValue ?? value ?? (typeof children === 'string' ? children : undefined);

  return (
    <ChakraTextarea
      size={'sm'}
      rows={rows}
      defaultValue={initialValue}
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
      my={2}
      resize={'vertical'}
      fontSize={'sm'}
      {...props}
    />
  );
};

export default React.memo(Textarea);
