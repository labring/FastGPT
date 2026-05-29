import { Box, Flex } from '@chakra-ui/react';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { ChatSidebarPaneEnum } from '@/pageComponents/chat/constants';
import { ChatContext } from '@/web/core/chat/context/chatContext';
import { ChatPageContext } from '@/web/core/chat/context/chatPageContext';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import { useContextSelector } from 'use-context-selector';

/**
 * 移动端侧边抽屉内的快捷应用入口。
 * 保持在导航区之后展示，点击后切到 Home 对话承载的快捷应用，避免复用桌面最近使用列表的滚动和折叠状态。
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
        const isActive = pane === ChatSidebarPaneEnum.HOME && activeAppId === app._id;

        return (
          <Flex
            key={app._id}
            p="8px"
            gap={2}
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
              handlePaneChange(ChatSidebarPaneEnum.HOME, app._id);
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
