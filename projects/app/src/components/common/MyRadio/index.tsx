import React from 'react';
import { Box, Flex, useTheme, Grid, type GridProps, theme, Image } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';

// @ts-ignore
interface Props extends GridProps {
  list: { icon?: string; title: string | React.ReactNode; desc?: string; value: any }[];
  iconSize?: string;
  align?: 'top' | 'center';
  value: any;
  hiddenCircle?: boolean;
  onChange: (e: any) => void;
}

const MyRadio = ({
  list,
  value,
  align = 'center',
  iconSize = '18px',
  hiddenCircle = false,
  p,
  onChange,
  ...props
}: Props) => {
  const { t } = useTranslation();
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
          pr={hiddenCircle ? '14px' : '36px'}
          p={p !== undefined ? `${p} !important` : undefined}
          border={theme.borders.sm}
          borderWidth={'1.5px'}
          borderRadius={'md'}
          position={'relative'}
          {...(value === item.value
            ? {
                borderColor: 'primary.400',
                bg: 'primary.50'
              }
            : {
                bg: 'myWhite.300',
                _hover: {
                  borderColor: 'primary.400'
                }
              })}
          _after={{
            content: '""',
            display: hiddenCircle ? 'none' : 'block',
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
                  borderColor: 'primary.600'
                }
              : {
                  border: '2px solid',
                  borderColor: 'myGray.200'
                })
          }}
          onClick={() => onChange(item.value)}
        >
          {!!item.icon && (
            <>
              {item.icon.startsWith('/') ? (
                <Image src={item.icon} mr={'14px'} w={iconSize} alt={''} />
              ) : (
                <MyIcon mr={'14px'} name={item.icon as any} w={iconSize} />
              )}
            </>
          )}
          <Box pr={hiddenCircle ? 0 : 2} color={'myGray.800'}>
            <Box>{typeof item.title === 'string' ? t(item.title) : item.title}</Box>
            {!!item.desc && (
              <Box fontSize={['xs', 'sm']} color={'myGray.500'}>
                {t(item.desc)}
              </Box>
            )}
          </Box>
        </Flex>
      ))}
    </Grid>
  );
};

export default MyRadio;
