import React from 'react';
import { Box, Flex, useTheme, Grid, type GridProps, theme } from '@chakra-ui/react';
import type { StackProps } from '@chakra-ui/react';
import MyIcon from '@/components/Icon';

// @ts-ignore
interface Props extends GridProps {
  list: { icon?: string; title: string; desc?: string; value: string | number }[];
  iconSize?: string;
  align?: 'top' | 'center';
  value: string | number;
  onChange: (e: string | number) => void;
}

const MyRadio = ({
  list,
  value,
  align = 'center',
  iconSize = '18px',
  onChange,
  ...props
}: Props) => {
  const theme = useTheme();
  return (
    <Grid gridGap={[3, 5]} fontSize={['sm', 'md']} {...props}>
      {list.map((item) => (
        <Flex
          key={item.value}
          alignItems={align}
          cursor={'pointer'}
          userSelect={'none'}
          py={3}
          pl={'14px'}
          pr={'36px'}
          border={theme.borders.sm}
          borderWidth={'1.5px'}
          borderRadius={'md'}
          bg={'myWhite.300'}
          position={'relative'}
          {...(value === item.value
            ? {
                borderColor: 'myBlue.700'
              }
            : {
                _hover: {
                  bg: 'white'
                }
              })}
          _after={{
            content: '""',
            position: 'absolute',
            right: '14px',
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
          onClick={() => onChange(item.value)}
        >
          {!!item.icon && <MyIcon mr={'14px'} name={item.icon as any} w={iconSize} />}
          <Box>
            <Box>{item.title}</Box>
            {!!item.desc && (
              <Box fontSize={'sm'} color={'myGray.500'}>
                {item.desc}
              </Box>
            )}
          </Box>
        </Flex>
      ))}
    </Grid>
  );
};

export default MyRadio;
