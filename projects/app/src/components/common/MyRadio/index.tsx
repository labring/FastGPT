import React from 'react';
import { Box, Flex, useTheme, Grid, type GridProps, Radio } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useToast } from '@fastgpt/web/hooks/useToast';
import Avatar from '@fastgpt/web/components/common/Avatar';

// @ts-ignore
interface Props extends GridProps {
  list: {
    icon?: string;
    title: string | React.ReactNode;
    desc?: string;
    value: any;
    forbidTip?: string; // If this value is exists, it will be prompted to disable when clicked
  }[];
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
  const { toast } = useToast();

  return (
    <Grid gridGap={[3, 5]} {...props}>
      {list.map((item) => (
        <Flex
          key={item.value}
          alignItems={align}
          cursor={'pointer'}
          userSelect={'none'}
          py={3}
          px={'4'}
          p={p !== undefined ? `${p} !important` : undefined}
          border={theme.borders.sm}
          borderWidth={'1.5px'}
          borderRadius={'md'}
          position={'relative'}
          {...(value === item.value
            ? {
                borderColor: 'primary.400',
                bg: 'primary.50',
                color: 'primary.600'
              }
            : {
                bg: 'myWhite.300',
                _hover: {
                  borderColor: 'primary.400'
                }
              })}
          onClick={() => {
            if (item.forbidTip) {
              toast({
                status: 'warning',
                title: item.forbidTip
              });
            } else {
              onChange(item.value);
            }
          }}
        >
          {!!item.icon && (
            <>
              <Avatar src={item.icon} w={iconSize} mr={'14px'} />
            </>
          )}
          <Box pr={hiddenCircle ? 0 : 2} flex={'1 0 0'}>
            <Box fontSize={'sm'} color={'myGray.800'}>
              {typeof item.title === 'string' ? t(item.title as any) : item.title}
            </Box>
            {!!item.desc && (
              <Box fontSize={'mini'} color={'myGray.500'} lineHeight={1.2}>
                {t(item.desc as any)}
              </Box>
            )}
          </Box>
          {!hiddenCircle && <Radio isChecked={value === item.value} />}
        </Flex>
      ))}
    </Grid>
  );
};

export default MyRadio;
