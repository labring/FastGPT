import React from 'react';
import { ChatPageContext } from '@/web/core/chat/context/chatPageContext';
import { ChatSidebarPaneEnum } from '@/pageComponents/chat/constants';
import { useContextSelector } from 'use-context-selector';
import { ChatContext } from '@/web/core/chat/context/chatContext';
import { Box, Flex } from '@chakra-ui/react';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import UserAvatarPopover from '@/pageComponents/chat/UserAvatarPopover';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useSystemStore } from '@/web/common/system/useSystemStore';

const ChatSliderFooter = () => {
  const { userInfo } = useUserStore();
  const { feConfigs } = useSystemStore();

  const onCloseSlider = useContextSelector(ChatContext, (v) => v.onCloseSlider);
  const handlePaneChange = useContextSelector(ChatPageContext, (v) => v.handlePaneChange);
  const pane = useContextSelector(ChatPageContext, (v) => v.pane);

  const isAdmin = !!userInfo?.team.permission.hasManagePer;
  const isSettingPane = pane === ChatSidebarPaneEnum.SETTING;

  return (
    <Flex flexShrink={0} gap={2} alignItems="center" justifyContent="space-between" p={2} mt="auto">
      <UserAvatarPopover isCollapsed={false} placement="top-end">
        <Flex alignItems="center" gap={2} borderRadius="50%" p={2}>
          <Avatar src={userInfo?.avatar} w={8} h={8} borderRadius="50%" bg="myGray.200" />
          <Box className="textEllipsis" flexGrow={1} fontSize={'sm'} fontWeight={500} minW={0}>
            {userInfo?.team?.memberName}
          </Box>
        </Flex>
      </UserAvatarPopover>

      {feConfigs.isPlus && isAdmin && (
        <Flex
          _hover={{ bg: 'myGray.200' }}
          bg={isSettingPane ? 'myGray.200' : 'transparent'}
          borderRadius={'8px'}
          p={2}
          cursor={'pointer'}
          w="40px"
          h="40px"
          alignItems="center"
          justifyContent="center"
          onClick={() => {
            handlePaneChange(ChatSidebarPaneEnum.SETTING);
            onCloseSlider();
          }}
        >
          <MyIcon
            w="20px"
            name="common/setting"
            fill={isSettingPane ? 'primary.500' : 'myGray.400'}
          />
        </Flex>
      )}
    </Flex>
  );
};

export default ChatSliderFooter;
