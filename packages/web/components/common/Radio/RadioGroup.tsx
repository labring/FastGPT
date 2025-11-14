import React from 'react';
import { Box, Flex, Grid, type GridProps, HStack } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import QuestionTip from '../MyTooltip/QuestionTip';

type Props<T> = Omit<GridProps, 'onChange'> & {
  list: {
    title: string;
    value: T;
    tooltip?: string;
  }[];
  value: T;
  defaultBg?: string;
  activeBg?: string;
  onChange: (e: T) => void;
};

const RadioGroup = <T = any,>({ list, value, onChange, ...props }: Props<T>) => {
  const { t } = useTranslation();

  return (
    <Flex gap={[3, 5]} fontSize={['sm', 'md']} alignItems={'center'} {...props}>
      {list.map((item) => (
        <Flex
          alignItems={'center'}
          key={item.value as any}
          cursor={'pointer'}
          userSelect={'none'}
          gap={1}
          onClick={() => onChange(item.value)}
        >
          <Box
            w={'18px'}
            h={'18px'}
            borderWidth={'2.4px'}
            borderColor={value === item.value ? 'primary.015' : 'transparent'}
            borderRadius={'50%'}
          >
            <Flex
              w={'100%'}
              h={'100%'}
              borderWidth={'1px'}
              borderColor={value === item.value ? 'primary.600' : 'borderColor.high'}
              bg={value === item.value ? 'primary.1' : 'transparent'}
              borderRadius={'50%'}
              alignItems={'center'}
              justifyContent={'center'}
            >
              <Box
                w={'5px'}
                h={'5px'}
                borderRadius={'50%'}
                bg={value === item.value ? 'primary.600' : 'transparent'}
              />
            </Flex>
          </Box>
          <HStack spacing={0.5} color={'myGray.900'} whiteSpace={'nowrap'} fontSize={'sm'}>
            <Box>{typeof item.title === 'string' ? t(item.title as any) : item.title}</Box>
            {!!item.tooltip && <QuestionTip label={item.tooltip} color={'myGray.600'} />}
          </HStack>
        </Flex>
      ))}
    </Flex>
  );
};

export default RadioGroup;
