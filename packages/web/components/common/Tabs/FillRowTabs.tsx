import React, { forwardRef } from 'react';
import { Flex, Box, type BoxProps, HStack } from '@chakra-ui/react';
import MyIcon from '../Icon';

type Props<T = string> = Omit<BoxProps, 'onChange'> & {
  list: {
    icon?: string;
    label: string | React.ReactNode;
    value: T;
  }[];
  value: T;
  onChange: (e: T) => void;
  iconSize?: string;
  labelSize?: string;
  iconGap?: number;
};

const FillRowTabs = ({
  list,
  value,
  onChange,
  py = '2.5',
  px = '4',
  iconSize = '18px',
  labelSize = 'sm',
  iconGap = 2,
  ...props
}: Props) => {
  return (
    <Box
      display={'inline-flex'}
      px={'3px'}
      py={'3px'}
      borderRadius={'sm'}
      borderWidth={'1px'}
      borderColor={'myGray.200'}
      bg={'myGray.50'}
      gap={'4px'}
      fontSize={'sm'}
      fontWeight={'medium'}
      {...props}
    >
      {list.map((item) => (
        <HStack
          key={item.value}
          flex={'1 0 0'}
          alignItems={'center'}
          justifyContent={'center'}
          cursor={'pointer'}
          borderRadius={'xs'}
          px={px}
          py={py}
          userSelect={'none'}
          whiteSpace={'noWrap'}
          gap={iconGap}
          {...(value === item.value
            ? {
                bg: 'white',
                boxShadow: '1.5',
                color: 'primary.600'
              }
            : {
                color: 'myGray.500',
                _hover: {
                  color: 'primary.600'
                },
                onClick: () => onChange(item.value)
              })}
        >
          {item.icon && <MyIcon name={item.icon as any} w={iconSize} />}
          <Box fontSize={labelSize}>{item.label}</Box>
        </HStack>
      ))}
    </Box>
  );
};

export default forwardRef(FillRowTabs) as <T>(
  props: Props<T> & { ref?: React.Ref<HTMLSelectElement> }
) => JSX.Element;
