import { Button } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { ChatContext } from '@/web/core/chat/context/chatContext';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import { useTranslation } from 'react-i18next';
import { useContextSelector } from 'use-context-selector';

/**
 * 移动端侧栏的新对话悬浮入口。
 * 绝对定位在底部头像区域上方，不占用历史列表流式布局空间。
 */
const ChatSliderMobileNewChatButton = () => {
  const { t } = useTranslation();
  const onChangeChatId = useContextSelector(ChatContext, (v) => v.onChangeChatId);
  const setCiteModalData = useContextSelector(ChatItemContext, (v) => v.setCiteModalData);

  return (
    <Button
      position="absolute"
      right="16px"
      bottom="68px"
      h="36px"
      minH="36px"
      px="20px"
      py="8px"
      borderRadius="9999px"
      bg="#3370FF"
      color="white"
      boxShadow="0 1px 2px 0 rgba(19, 51, 107, 0.05), 0 0 1px 0 rgba(19, 51, 107, 0.08)"
      _hover={{ bg: '#3370FF' }}
      _active={{ bg: '#3370FF' }}
      leftIcon={<MyIcon name="core/chat/chatLight" w="16px" h="16px" color="white" fill="white" />}
      onClick={() => {
        onChangeChatId();
        setCiteModalData(undefined);
      }}
    >
      {t('common:core.chat.New Chat')}
    </Button>
  );
};

export default ChatSliderMobileNewChatButton;
