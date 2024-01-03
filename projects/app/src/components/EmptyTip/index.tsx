import React from 'react';
import { Flex, Box, FlexProps } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';

type Props = FlexProps & {
  text?: string | React.ReactNode;
};

const EmptyTip = ({ text, ...props }: Props) => {
  const { t } = useTranslation();
  return (
    <Flex mt={5} flexDirection={'column'} alignItems={'center'} pt={'10vh'} {...props}>
      <MyIcon name="empty" w={'48px'} h={'48px'} color={'transparent'} />
      <Box mt={2} color={'myGray.500'}>
        {text || t('common.empty.Common Tip')}
      </Box>
    </Flex>
  );
};

export default EmptyTip;
