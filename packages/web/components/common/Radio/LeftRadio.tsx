import React from 'react';
import { Box, Flex, useTheme, Grid, type GridProps, HStack } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import QuestionTip from '../MyTooltip/QuestionTip';

type Props<T> = Omit<GridProps, 'onChange'> & {
  list: {
    title: string | React.ReactNode;
    desc?: string;
    value: T;
    children?: React.ReactNode;
    tooltip?: string;
  }[];
  align?: 'flex-top' | 'center';
  value: T;
  defaultBg?: string;
  activeBg?: string;
  onChange: (e: T) => void;
};

const LeftRadio = <T = any,>({
  list,
  value,
  align = 'flex-top',
  px = 3.5,
  py = 4,
  defaultBg = 'myGray.50',
  activeBg = 'primary.50',
  onChange,
  ...props
}: Props<T>) => {
  const { t } = useTranslation();
  const theme = useTheme();

  return (
    <Grid gridGap={[3, 5]} fontSize={['sm', 'md']} {...props}>
      {list.map((item) => (
        <Box
          key={item.value as any}
          cursor={'pointer'}
          userSelect={'none'}
          px={px}
          py={py}
          border={'base'}
          borderWidth={'1px'}
          borderRadius={'md'}
          position={'relative'}
          {...(value === item.value
            ? {
                borderColor: list.length > 1 ? 'primary.400' : '',
                bg: activeBg,
                boxShadow: list.length > 1 ? 'focus' : 'none'
              }
            : {
                bg: defaultBg,
                _hover: {
                  borderColor: 'primary.300'
                }
              })}
          onClick={() => onChange(item.value)}
        >
          {/* Circle */}
          <Flex alignItems={'center'}>
            {list.length > 1 && (
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
            )}
            <Box flex={'1 0 0'}>
              {typeof item.title === 'string' ? (
                <HStack
                  spacing={1}
                  color={'myGray.900'}
                  fontWeight={item.desc ? '500' : 'normal'}
                  whiteSpace={'nowrap'}
                  fontSize={'sm'}
                  lineHeight={1}
                >
                  <Box>{t(item.title as any)}</Box>
                  {!!item.tooltip && <QuestionTip label={item.tooltip} color={'myGray.600'} />}
                </HStack>
              ) : (
                item.title
              )}

              {!!item.desc && (
                <Box fontSize={'xs'} color={'myGray.500'} mt={1.5} lineHeight={1.2}>
                  {t(item.desc as any)}
                </Box>
              )}
            </Box>
          </Flex>
          {item?.children && (
            <Box mt={4} pt={4} borderTop={'base'} cursor={'default'}>
              {item?.children}
            </Box>
          )}
        </Box>
      ))}
    </Grid>
  );
};

export default LeftRadio;
