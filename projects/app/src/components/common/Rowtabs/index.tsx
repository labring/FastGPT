import React from 'react';
import { Flex, Box, BoxProps, border } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';

type Props = BoxProps & {
  list: {
    icon?: string;
    label: string | React.ReactNode;
    value: string;
  }[];
  value: string;
  onChange: (e: string) => void;
};

const RowTabs = ({ list, value, onChange, py = '7px', px = '12px', ...props }: Props) => {
  return (
    <Box display={'inline-flex'} px={'3px'} {...props}>
      {list.map((item) => (
        <Flex
          key={item.value}
          flex={'1 0 0'}
          alignItems={'center'}
          cursor={'pointer'}
          px={px}
          py={py}
          userSelect={'none'}
          whiteSpace={'noWrap'}
          borderBottom={'2px solid'}
          {...(value === item.value
            ? {
                bg: 'white',
                color: 'primary.600',
                borderColor: 'primary.600'
              }
            : {
                borderColor: 'myGray.100',
                onClick: () => onChange(item.value)
              })}
        >
          {item.icon && <MyIcon name={item.icon as any} mr={1} w={'14px'} />}
          <Box fontSize={'sm'}>{item.label}</Box>
        </Flex>
      ))}
    </Box>
  );
};

export default RowTabs;
