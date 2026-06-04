import { Box, Flex } from '@chakra-ui/react';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { ChatSidebarPaneEnum } from '@/pageComponents/chat/constants';
import { ChatContext } from '@/web/core/chat/context/chatContext';
import { ChatPageContext } from '@/web/core/chat/context/chatPageContext';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import { useContextSelector } from 'use-context-selector';

/**
 * 移动端侧边抽屉内的快捷应用入口。
 * 点击后进入普通应用聊天，保持“首页”菜单只表示首页聊天本身。
 */
const ChatSliderQuickAppList = () => {
  const { appId: activeAppId, setChatId } = useChatStore();

  const quickAppList = useContextSelector(
    ChatPageContext,
    (v) => v.chatSettings?.quickAppList || []
  );
  const pane = useContextSelector(ChatPageContext, (v) => v.pane);
  const handlePaneChange = useContextSelector(ChatPageContext, (v) => v.handlePaneChange);
  const onCloseSlider = useContextSelector(ChatContext, (v) => v.onCloseSlider);

  if (quickAppList.length === 0) return null;

  return (
    <Flex flexDir="column" gap="4px">
      {quickAppList.map((app) => {
        const isActive = pane === ChatSidebarPaneEnum.RECENTLY_USED_APPS && activeAppId === app._id;

        return (
          <Flex
            key={app._id}
            p="8px"
            gap={2}
            h="44px"
            minH="44px"
            cursor="pointer"
            borderRadius="8px"
            alignItems="center"
            bg={isActive ? 'primary.100' : 'transparent'}
            color={isActive ? 'primary.600' : 'myGray.500'}
            _hover={{
              bg: 'primary.100',
              color: 'primary.600'
            }}
            onClick={() => {
              handlePaneChange(ChatSidebarPaneEnum.RECENTLY_USED_APPS, app._id);
              onCloseSlider();
              setChatId();
            }}
          >
            <Avatar src={app.avatar} w="20px" borderRadius="6px" />
            <Box fontSize="sm" fontWeight={500} className="textEllipsis">
              {app.name}
            </Box>
          </Flex>
        );
      })}
    </Flex>
  );
};

export default ChatSliderQuickAppList;
