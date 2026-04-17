import React from 'react';
import { Box, Flex, type FlexProps } from '@chakra-ui/react';
import MyIcon from '../Icon';
import type { IconNameType } from '../Icon/type';

type BannerStatus = 'info' | 'warning' | 'error' | 'success';

type StatusConfig = {
  bg: string;
  color: string;
  icon: IconNameType;
};

const statusConfigMap: Record<BannerStatus, StatusConfig> = {
  info: {
    bg: 'blue.50',
    color: 'blue.700',
    icon: 'infoRounded'
  },
  warning: {
    bg: 'yellow.25',
    color: 'yellow.700',
    icon: 'common/warn'
  },
  error: {
    bg: 'red.25',
    color: 'red.700',
    icon: 'common/errorFill'
  },
  success: {
    bg: 'green.25',
    color: 'green.700',
    icon: 'checkCircle'
  }
};

type InfoBannerProps = {
  status?: BannerStatus;
  children: React.ReactNode;
} & Omit<FlexProps, 'children'>;

const InfoBanner = ({ status = 'info', children, ...props }: InfoBannerProps) => {
  const { bg, color, icon } = statusConfigMap[status];

  return (
    <Flex align="center" bg={bg} borderRadius="8px" px={3} py={2} gap={2} {...props}>
      <MyIcon name={icon} w="16px" color={color} flexShrink={0} />
      <Box fontSize="xs" color={color} flex={1}>
        {children}
      </Box>
    </Flex>
  );
};

export default InfoBanner;
