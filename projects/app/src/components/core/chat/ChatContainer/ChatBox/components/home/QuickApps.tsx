import React from 'react';
import { useContextSelector } from 'use-context-selector';
import { ChatBoxContext } from '../../Provider';
import { Box, Flex } from '@chakra-ui/react';
import Avatar from '@fastgpt/web/components/common/Avatar';

type QuickAppsProps = {
  variant?: 'desktop' | 'mobile';
};

const QuickApps = ({ variant = 'desktop' }: QuickAppsProps) => {
  const quickAppList = useContextSelector(ChatBoxContext, (v) => v.quickAppList);
  const onSwitchQuickApp = useContextSelector(ChatBoxContext, (v) => v.onSwitchQuickApp);
  const isMobile = variant === 'mobile';

  return quickAppList && quickAppList.length > 0 ? (
    <Flex
      mb={isMobile ? 0 : '2'}
      mx={isMobile ? 0 : 2}
      alignItems={isMobile ? 'flex-start' : 'center'}
      gap={isMobile ? '12px' : 2}
      flexWrap={isMobile ? 'nowrap' : 'wrap'}
      flexDir={isMobile ? 'column' : 'row'}
    >
      {quickAppList.map((q) => (
        <Flex
          key={q._id}
          alignItems="center"
          gap={isMobile ? '8px' : 1}
          h={isMobile ? '44px' : undefined}
          border="sm"
          borderRadius="md"
          px={isMobile ? '16px' : 2}
          py={isMobile ? 0 : 1}
          maxW={isMobile ? '100%' : undefined}
          cursor="pointer"
          _hover={{ bg: 'myGray.50' }}
          bg="white"
          color="myGray.600"
          borderColor="myGray.200"
          onClick={() => onSwitchQuickApp?.(q._id)}
        >
          <Avatar src={q.avatar} w={isMobile ? '24px' : 4} borderRadius="xs" />
          <Box
            fontSize={isMobile ? '14px' : 'xs'}
            fontWeight="500"
            userSelect="none"
            {...(isMobile
              ? {
                  className: 'textEllipsis',
                  minW: 0
                }
              : {})}
          >
            {q.name}
          </Box>
        </Flex>
      ))}
    </Flex>
  ) : null;
};

export default QuickApps;
