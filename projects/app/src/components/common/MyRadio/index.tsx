import React from 'react';
import { Box, Flex, useTheme, Grid, type GridProps, theme, Image } from '@chakra-ui/react';
import MyIcon from '@/components/Icon';
import { useTranslation } from 'next-i18next';

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
          pr={'36px'}
          border={theme.borders.sm}
          borderWidth={'1.5px'}
          borderRadius={'md'}
          position={'relative'}
          {...(value === item.value
            ? {
                borderColor: 'myBlue.500',
                bg: 'myBlue.100'
              }
            : {
                bg: 'myWhite.300',
                _hover: {
                  borderColor: 'myBlue.500'
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
          {!!item.icon && (
            <>
              {item.icon.startsWith('/') ? (
                <Image src={item.icon} mr={'14px'} w={iconSize} alt={''} />
              ) : (
                <MyIcon mr={'14px'} name={item.icon as any} w={iconSize} />
              )}
            </>
          )}
          <Box pr={2}>
            <Box>{t(item.title)}</Box>
            {!!item.desc && (
              <Box fontSize={'sm'} color={'myGray.500'}>
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
