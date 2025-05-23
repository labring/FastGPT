// 新组件: packages/web/components/common/MyBox/InfoTip.tsx
import React from 'react';
import { Box, Flex, type FlexProps } from '@chakra-ui/react';
import Icon from '../Icon';

const InfoTip = ({
  children,
  ...props
}: FlexProps & {
  children: React.ReactNode;
}) => {
  return (
    <Flex
      align="center"
      width="328px"
      height="28px"
      gap="4px"
      borderRadius="6px"
      py="6px"
      px="12px"
      bg="var(--Royal-Blue-50, #F0F4FF)"
      {...props}
    >
      <Icon name="common/info-rounded" w="16px" h="16px" color="primary.600" />
      <Box fontSize="sm" color="primary.600">
        {children}
      </Box>
    </Flex>
  );
};

export default InfoTip;
