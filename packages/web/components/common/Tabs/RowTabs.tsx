import React from 'react';
import { Flex, Box } from '@chakra-ui/react';
import MyIcon from '../Icon';

type Props = {
  list: {
    icon?: string;
    label: string | React.ReactNode;
    value: string;
  }[];
  value: string;
  onChange: (e: string) => void;
};

const RowTabs = ({ list, value, onChange }: Props) => {
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
    >
      {list.map((item) => (
        <Flex
          key={item.value}
          alignItems={'center'}
          cursor={'pointer'}
          borderRadius={'md'}
          px={'12px'}
          py={'7px'}
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
