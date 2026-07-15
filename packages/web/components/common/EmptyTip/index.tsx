import React from 'react';
import { Flex, Box, type BoxProps, type FlexProps } from '@chakra-ui/react';
import MyIcon from '../Icon';
import { useTranslation } from 'next-i18next';

type Props = FlexProps & {
  text?: string | React.ReactNode;
  iconSize?: string | number;
  textGap?: string | number;
  textProps?: BoxProps;
};

const EmptyTip = ({ text, iconSize = '48px', textGap = 2, textProps, ...props }: Props) => {
  const { t } = useTranslation();
  return (
    <Flex mt={5} flexDirection={'column'} alignItems={'center'} py={'10vh'} {...props}>
      <MyIcon name="empty" w={iconSize} h={iconSize} color={'transparent'} />
      <Box mt={textGap} color={'myGray.500'} fontSize={'sm'} {...textProps}>
        {text || t('common:no_more_data')}
      </Box>
    </Flex>
  );
};

export default EmptyTip;
