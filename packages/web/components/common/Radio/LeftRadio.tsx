import React from 'react';
import { Box, Flex, useTheme, Grid, type GridProps, HStack } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyTooltip from '../MyTooltip';
import QuestionTip from '../MyTooltip/QuestionTip';

// @ts-ignore
interface Props extends GridProps {
  list: {
    title: string;
    desc?: string;
    value: any;
    children?: React.ReactNode;
    tooltip?: string;
  }[];
  align?: 'flex-top' | 'center';
  value: any;
  defaultBg?: string;
  activeBg?: string;
  onChange: (e: any) => void;
}

const LeftRadio = ({
  list,
  value,
  align = 'flex-top',
  px = 3,
  py = 4,
  defaultBg = 'myGray.50',
  activeBg = 'primary.50',
  onChange,
  ...props
}: Props) => {
  const { t } = useTranslation();
  const theme = useTheme();

  return (
    <Grid gridGap={[3, 5]} fontSize={['sm', 'md']} {...props}>
      {list.map((item) => (
        <Flex
          alignItems={item.desc ? align : 'center'}
          key={item.value}
          cursor={'pointer'}
          userSelect={'none'}
          px={px}
          py={py}
          border={theme.borders.sm}
          borderWidth={'1px'}
          borderRadius={'md'}
          position={'relative'}
          {...(value === item.value
            ? {
                borderColor: 'primary.400',
                bg: activeBg,
                boxShadow: 'focus'
              }
            : {
                bg: defaultBg,
                _hover: {
                  borderColor: 'primary.300'
                }
              })}
          onClick={() => onChange(item.value)}
        >
          <Box
            w={'18px'}
            h={'18px'}
            borderWidth={'2.4px'}
            borderColor={value === item.value ? 'primary.015' : 'transparent'}
            borderRadius={'50%'}
            mr={3}
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
              ></Box>
            </Flex>
          </Box>
          <Box flex={'1 0 0'}>
            <Flex alignItems={'center'}>
              <HStack
                spacing={1}
                color={'myGray.900'}
                fontWeight={item.desc ? '500' : 'normal'}
                whiteSpace={'nowrap'}
                fontSize={'sm'}
              >
                <Box>{typeof item.title === 'string' ? t(item.title as any) : item.title}</Box>
                {!!item.tooltip && <QuestionTip label={item.tooltip} ml={1} color={'myGray.600'} />}
              </HStack>
            </Flex>
            {!!item.desc && (
              <Box fontSize={'xs'} color={'myGray.500'} lineHeight={1.2}>
                {t(item.desc as any)}
              </Box>
            )}
            {item?.children}
          </Box>
        </Flex>
      ))}
    </Grid>
  );
};

export default LeftRadio;
