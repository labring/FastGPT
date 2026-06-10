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
          gap="8px"
          h="44px"
          border="sm"
          borderRadius="md"
          px="16px"
          py="8px"
          maxW={isMobile ? '100%' : undefined}
          cursor="pointer"
          _hover={{ bg: '#F0F4FF', borderColor: '#C5D7FF', color: 'primary.600' }}
          bg="white"
          color="myGray.600"
          borderColor="myGray.200"
          onClick={() => onSwitchQuickApp?.(q._id)}
        >
          <Avatar src={q.avatar} w="24px" borderRadius="xs" />
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
