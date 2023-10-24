import React from 'react';
import { Flex, Box, FlexProps } from '@chakra-ui/react';
import MyIcon from '../Icon';

type Props = FlexProps & {
  text?: string | null;
};

const EmptyTip = ({ text, ...props }: Props) => {
  return (
    <Flex mt={5} flexDirection={'column'} alignItems={'center'} pt={'10vh'} {...props}>
      <MyIcon name="empty" w={'48px'} h={'48px'} color={'transparent'} />
      <Box mt={2} color={'myGray.500'}>
        {text || '没有什么数据噢~'}
      </Box>
    </Flex>
  );
};

export default EmptyTip;
