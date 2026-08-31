import React, { forwardRef } from 'react';
import { Box, Flex } from '@chakra-ui/react';
import type { FlexProps } from '@chakra-ui/react';
import type { ReactNode } from 'react';
import MyIcon from '../Icon';

export type FilterButtonProps = Omit<FlexProps, 'children' | 'title' | 'value'> & {
  title: ReactNode;
  value: ReactNode;
};

const FilterButton = forwardRef<HTMLDivElement, FilterButtonProps>(
  ({ title, value, ...props }, ref) => (
    <Flex
      ref={ref}
      as="button"
      alignItems={'center'}
      gap={2}
      px={3}
      w={'fit-content'}
      maxW={'200px'}
      minW={0}
      flexShrink={0}
      h={'36px'}
      border={'1px solid'}
      borderColor={'myGray.200'}
      borderRadius={'sm'}
      bg={'white'}
      color={'myGray.900'}
      cursor={'pointer'}
      type="button"
      fontSize={'mini'}
      lineHeight={'16px'}
      _hover={{
        boxShadow: 'focus',
        borderColor: 'primary.300'
      }}
      {...props}
    >
      <Flex alignItems={'center'} gap={2} minW={0} overflow={'hidden'}>
        <Box flexShrink={0}>{title}</Box>
        <Box w={'1px'} h={'16px'} flexShrink={0} bg={'myGray.200'} />
        <Box minW={0} overflow={'hidden'} textOverflow={'ellipsis'} whiteSpace={'nowrap'}>
          {value}
        </Box>
      </Flex>
      <MyIcon
        name={'core/chat/chevronDown'}
        w={'16px'}
        h={'16px'}
        flexShrink={0}
        color={'myGray.500'}
      />
    </Flex>
  )
);

FilterButton.displayName = 'FilterButton';

export default FilterButton;
