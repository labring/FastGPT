import React from 'react';
import { Flex, Box, FlexProps } from '@chakra-ui/react';
import MyIcon from '../Icon';
import { useTranslation } from 'next-i18next';

type Props = FlexProps & {
  text?: string | React.ReactNode;
  iconSize?: string | number;
};

const EmptyTip = ({ text, iconSize = '48px', ...props }: Props) => {
  const { t } = useTranslation();
  return (
    <Flex mt={5} flexDirection={'column'} alignItems={'center'} py={'10vh'} {...props}>
      <MyIcon name="empty" w={iconSize} h={iconSize} color={'transparent'} />
      <Box mt={2} color={'myGray.500'} fontSize={'sm'}>
        {text || t('common:common.empty.Common Tip')}
      </Box>
    </Flex>
  );
};

export default EmptyTip;
