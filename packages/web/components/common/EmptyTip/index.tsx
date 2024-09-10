import React from 'react';
import { Flex, Box, FlexProps } from '@chakra-ui/react';
import MyIcon from '../Icon';
import { useTranslation } from 'next-i18next';

type Props = FlexProps & {
  text?: string | React.ReactNode;
  iconW?: string | number;
  iconH?: string | number;
};

const EmptyTip = ({ text, iconW, iconH, ...props }: Props) => {
  const { t } = useTranslation();
  return (
    <Flex mt={5} flexDirection={'column'} alignItems={'center'} py={'10vh'} {...props}>
      <MyIcon name="empty" w={iconW || '48px'} h={iconH || '48px'} color={'transparent'} />
      <Box mt={2} color={'myGray.500'} fontSize={'sm'}>
        {text || t('common:common.empty.Common Tip')}
      </Box>
    </Flex>
  );
};

export default EmptyTip;
