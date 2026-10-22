import React, { forwardRef } from 'react';
import { Box, Flex, Input } from '@chakra-ui/react';
import type { FlexProps, InputProps } from '@chakra-ui/react';
import type { ReactNode } from 'react';

export type FilterInputProps = Omit<FlexProps, 'onChange'> & {
  label?: ReactNode;
  value?: string;
  placeholder?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  inputProps?: Omit<InputProps, 'value' | 'onChange' | 'placeholder'>;
};

/**
 * 列表工具栏筛选输入框组件，形态与 FilterButton / DateRangePicker 保持一致：
 * 默认高度 36px，左侧展示 label 标签与 16px 分割线，聚焦时外描边变蓝。
 */
const FilterInput = forwardRef<HTMLInputElement, FilterInputProps>(
  ({ label, value, placeholder, onChange, inputProps, ...props }, ref) => {
    return (
      <Flex
        alignItems={'center'}
        h={'36px'}
        borderRadius={'sm'}
        border={'1px solid'}
        borderColor={'myGray.200'}
        bg={'white'}
        fontSize={'sm'}
        lineHeight={'16px'}
        _hover={{
          borderColor: 'primary.300'
        }}
        _focusWithin={{
          borderColor: 'primary.600',
          boxShadow: '0 0 0 2.4px rgba(51, 112, 255, 0.15)'
        }}
        pl={3}
        pr={2}
        {...props}
      >
        {label && (
          <>
            <Box flexShrink={0} color={'myGray.900'} whiteSpace={'nowrap'}>
              {label}
            </Box>
            <Box w={'1px'} h={'16px'} flexShrink={0} bg={'myGray.200'} mx={2} />
          </>
        )}
        <Input
          ref={ref}
          flex={1}
          minW={0}
          h={'full'}
          fontSize={'sm'}
          border={'none'}
          pl={0}
          pr={0}
          value={value}
          placeholder={placeholder}
          onChange={onChange}
          _focus={{
            boxShadow: 'none'
          }}
          _placeholder={{
            fontSize: 'sm',
            color: 'myGray.500'
          }}
          {...inputProps}
        />
      </Flex>
    );
  }
);

FilterInput.displayName = 'FilterInput';

export default React.memo(FilterInput);
