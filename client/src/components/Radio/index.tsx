import React from 'react';
import { Stack, Box, Flex, useTheme } from '@chakra-ui/react';
import type { StackProps } from '@chakra-ui/react';

// @ts-ignore
interface Props extends StackProps {
  list: { label: string; value: string | number }[];
  value: string | number;
  onChange: (e: string | number) => void;
}

const Radio = ({ list, value, onChange, ...props }: Props) => {
  return (
    <Stack {...props} spacing={5} direction={'row'}>
      {list.map((item) => (
        <Flex
          key={item.value}
          alignItems={'center'}
          cursor={'pointer'}
          userSelect={'none'}
          _before={{
            content: '""',
            w: '16px',
            h: '16px',
            mr: 1,
            borderRadius: '16px',
            transition: '0.2s',
            boxSizing: 'border-box',
            ...(value === item.value
              ? {
                  border: '5px solid',
                  borderColor: 'myBlue.700'
                }
              : {
                  border: '2px solid',
                  borderColor: 'myGray.200'
                })
          }}
          _hover={{
            _before: {
              borderColor: 'myBlue.600'
            }
          }}
          onClick={() => onChange(item.value)}
        >
          {item.label}
        </Flex>
      ))}
    </Stack>
  );
};

export default Radio;
