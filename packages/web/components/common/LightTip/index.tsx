import React from 'react';
import { Box, HStack, Icon, StackProps } from '@chakra-ui/react';

const LightTip = ({
  text,
  ...props
}: {
  text: string;
} & StackProps) => {
  return (
    <HStack
      px="3"
      py="1"
      color="primary.600"
      bgColor="primary.50"
      borderRadius="md"
      fontSize={'sm'}
      {...props}
    >
      <Icon name="common/info" w="1rem" />
      <Box>{text}</Box>
    </HStack>
  );
};

export default LightTip;
