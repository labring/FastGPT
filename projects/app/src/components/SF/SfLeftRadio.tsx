import React, { useCallback } from 'react';
import { Box, Grid, type GridProps, HStack } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';

type SfLeftRadioItem<T> = {
  title: string | React.ReactNode;
  desc?: string;
  value: T;
  children?: React.ReactNode;
  tooltip?: string;
};

type Props<T> = Omit<GridProps, 'onChange'> & {
  list: SfLeftRadioItem<T>[];
  value: T;
  onChange: (e: T) => void;
  isDisabled?: boolean;
};

const SfLeftRadio = <T = any,>({
  list,
  value,
  px = 3,
  py = 1.5,
  gridGap = 2,
  onChange,
  isDisabled = false,
  ...props
}: Props<T>) => {
  const { t } = useTranslation();

  const getBoxStyle = useCallback(
    (isActive: boolean) => {
      const baseStyle = {
        px,
        py,
        borderWidth: '1px',
        borderStyle: 'solid',
        borderRadius: '4px',
        transition: 'all 0.15s ease'
      };

      if (isActive) {
        return {
          ...baseStyle,
          bg: 'white',
          borderColor: '#1770E6',
          boxShadow: '0px 0px 0px 2.15px rgba(23, 112, 230, 0.15)',
          cursor: 'pointer'
        };
      }
      if (isDisabled) {
        return {
          ...baseStyle,
          bg: '#F0F2F5',
          borderColor: '#E8EBF0',
          color: 'myGray.400',
          cursor: 'not-allowed',
          opacity: 0.6
        };
      }
      return {
        ...baseStyle,
        borderColor: '#E8EBF0',
        cursor: 'pointer',
        _hover: { borderColor: '#1770E6' }
      };
    },
    [isDisabled, px, py]
  );

  return (
    <Grid gridGap={gridGap} {...props}>
      {list.map((item) => {
        const isActive = value === item.value;
        return (
          <Box
            key={item.value as any}
            userSelect={'none'}
            onClick={() => !isDisabled && onChange(item.value)}
            {...getBoxStyle(isActive)}
          >
            {typeof item.title === 'string' ? (
              <HStack
                spacing={1}
                fontWeight={'normal'}
                fontSize={'12px'}
                lineHeight={'20px'}
                color={'myGray.900'}
              >
                <Box noOfLines={1}>{t(item.title as any)}</Box>
                {!!item.tooltip && <QuestionTip label={item.tooltip} color={'myGray.600'} />}
              </HStack>
            ) : (
              item.title
            )}
            {!!item.desc && (
              <Box fontSize={'xs'} mt={1} lineHeight={1.2} color={'myGray.600'}>
                {t(item.desc as any)}
              </Box>
            )}
            {item?.children && (
              <Box
                mt={3}
                pt={3}
                borderTop={'1px solid'}
                borderTopColor={'#E8EBF0'}
                cursor={'default'}
              >
                {item.children}
              </Box>
            )}
          </Box>
        );
      })}
    </Grid>
  );
};

export default SfLeftRadio;
