import React from 'react';
import { Flex, Box, BoxProps } from '@chakra-ui/react';
import MyIcon from '../Icon';

type Props = BoxProps & {
  list: {
    icon?: string;
    label: string | React.ReactNode;
    value: string;
  }[];
  value: string;
  onChange: (e: string) => void;
};

const RowTabs = ({ list, value, onChange, py = '7px', ...props }: Props) => {
  return (
    <Box
      display={'inline-flex'}
      px={'3px'}
      py={'3px'}
      borderRadius={'md'}
      borderWidth={'1px'}
      borderColor={'borderColor.base'}
      bg={'myGray.50'}
      gap={'4px'}
      {...props}
    >
      {list.map((item) => (
        <Flex
          key={item.value}
          flex={'1 0 0'}
          alignItems={'center'}
          cursor={'pointer'}
          borderRadius={'md'}
          px={'12px'}
          py={py}
          userSelect={'none'}
          {...(value === item.value
            ? {
                bg: 'white',
                boxShadow: '1.5',
                color: 'primary.600'
              }
            : {
                onClick: () => onChange(item.value)
              })}
        >
          {item.icon && <MyIcon name={item.icon as any} mr={1} w={'14px'} />}
          <Box>{item.label}</Box>
        </Flex>
      ))}
    </Box>
  );
};

export default RowTabs;
