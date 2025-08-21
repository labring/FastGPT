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

  return (
    <Grid gridGap={'12px'} fontSize={['sm', 'md']} {...props}>
      {list.map((item) => {
        const isActive = value === item.value;
        const isDisabledAndInactive = isDisabled && !isActive;

        const containerCursor = isDisabledAndInactive ? 'not-allowed' : 'pointer';
        const containerOpacity = isDisabledAndInactive ? 0.6 : 1;

        const containerStyles = isDisabled
          ? isActive
            ? {
                borderColor: 'primary.400',
                bg: activeBg,
                boxShadow: 'focus'
              }
            : {
                bg: '#FAFBFC',
                borderColor: 'myGray.200',
                color: 'myGray.500'
              }
          : isActive
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
              };

        const outerBorderColor = isDisabledAndInactive
          ? 'transparent'
          : isActive
            ? 'primary.015'
            : 'transparent';

        const innerBorderColor = isActive ? 'primary.600' : 'borderColor.high';
        const innerBg = isActive ? 'primary.1' : 'transparent';
        const dotBg = isActive ? 'primary.600' : 'transparent';

        const titleColor = isDisabledAndInactive ? '#B1B6BE' : isActive ? '#3370FF' : 'myGray.900';

        const descColor = isDisabledAndInactive ? '#B1B6BE' : isActive ? '#3370FF' : 'myGray.500';

        return (
          <Box
            key={item.value as any}
            cursor={containerCursor}
            userSelect={'none'}
            px={px}
            py={py}
            border={'base'}
            borderWidth={'1px'}
            borderRadius={'md'}
            position={'relative'}
            opacity={containerOpacity}
            {...containerStyles}
            onClick={() => !isDisabled && onChange(item.value)}
          >
            {/* Circle */}
            <Flex alignItems={align}>
              <Box
                w={'18px'}
                h={'18px'}
                borderWidth={'2.4px'}
                borderColor={outerBorderColor}
                borderRadius={'50%'}
                mr={3}
                my={'2px'}
              >
                <Flex
                  w={'100%'}
                  h={'100%'}
                  borderWidth={'1px'}
                  borderColor={innerBorderColor}
                  bg={innerBg}
                  borderRadius={'50%'}
                  alignItems={'center'}
                  justifyContent={'center'}
                >
                  <Box w={'5px'} h={'5px'} borderRadius={'50%'} bg={dotBg}></Box>
                </Flex>
              </Box>
              <Box flex={'1 0 0'}>
                {typeof item.title === 'string' ? (
                  <HStack
                    spacing={1}
                    color={titleColor}
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
                  <Box fontSize={'xs'} color={descColor} mt={1.5} lineHeight={1.2}>
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
        );
      })}
    </Grid>
  );
};

export default LeftRadio;
