import React from 'react';
import { Box, HStack, Icon, type StackProps } from '@chakra-ui/react';

const LightTip = ({
  text,
  icon = 'common/info',
  ...props
}: {
  icon?: string;
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
      <Icon name={icon} w="1rem" />
      <Box>{text}</Box>
    </HStack>
  );
};

export default LightTip;
