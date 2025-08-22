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
    disabled?: boolean;
  }[];
  align?: 'flex-top' | 'center';
  value: T;
  defaultBg?: string;
  activeBg?: string;
  onChange: (e: T) => void;
  isDisabled?: boolean;
};

const LeftRadio = <T = any,>({
  list,
  value,
  align = 'center',
  px = 3.5,
  py = 4,
  defaultBg = 'myGray.50',
  activeBg = 'primary.50',
  onChange,
  isDisabled = false,
  ...props
}: Props<T>) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const items = React.useMemo(
    () =>
      list.map((item) => {
        const isActive = value === item.value;
        const shouldDisable = isDisabled || !!item.disabled;

        const boxStyles = (() => {
          if (isActive) {
            return {
              borderColor: list.length > 1 ? 'primary.400' : '',
              bg: activeBg,
              boxShadow: list.length > 1 ? 'focus' : 'none',
              cursor: 'pointer',
              opacity: 1
            };
          }

          if (shouldDisable && !isActive) {
            return {
              bg: 'myWhite.300',
              borderColor: 'myGray.200',
              color: 'myGray.500',
              cursor: 'not-allowed',
              opacity: 0.6
            };
          }

          return {
            bg: defaultBg,
            _hover: { borderColor: 'primary.300' },
            cursor: 'pointer',
            opacity: 1
          };
        })();

        return { item, boxStyles, isDisabled: shouldDisable, isActive } as const;
      }),
    [list, value, activeBg, defaultBg, isDisabled]
  );

  return (
    <Grid gridGap={'12px'} fontSize={['sm', 'md']} {...props}>
      {items.map(({ item, boxStyles, isDisabled, isActive }) => (
        <Box
          key={item.value as any}
          userSelect={'none'}
          px={px}
          py={py}
          border={'base'}
          borderWidth={'1px'}
          borderRadius={'md'}
          position={'relative'}
          {...boxStyles}
          onClick={() => !isDisabled && onChange(item.value)}
        >
          {/* Circle */}
          <Flex alignItems={align}>
            <Box
              w={'18px'}
              h={'18px'}
              borderWidth={'2.4px'}
              borderColor={isActive ? 'primary.015' : 'transparent'}
              borderRadius={'50%'}
              mr={3}
            >
              <Flex
                w={'100%'}
                h={'100%'}
                borderWidth={'1px'}
                borderRadius={'50%'}
                alignItems={'center'}
                justifyContent={'center'}
                {...(isActive
                  ? {
                      borderColor: 'primary.600',
                      bg: 'primary.1'
                    }
                  : {
                      borderColor: 'borderColor.high',
                      bg: 'transparent'
                    })}
              >
                <Box
                  w={'5px'}
                  h={'5px'}
                  borderRadius={'50%'}
                  bg={isActive ? 'primary.600' : 'transparent'}
                ></Box>
              </Flex>
            </Box>
            <Box flex={'1 0 0'}>
              {typeof item.title === 'string' ? (
                <HStack
                  spacing={1}
                  color={
                    isDisabled && !isActive ? 'myGray.400' : isActive ? 'primary.600' : 'myGray.900'
                  }
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
                <Box
                  fontSize={'xs'}
                  color={
                    isDisabled && !isActive ? 'myGray.400' : isActive ? 'primary.600' : 'myGray.500'
                  }
                  mt={1.5}
                  lineHeight={1.2}
                >
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
