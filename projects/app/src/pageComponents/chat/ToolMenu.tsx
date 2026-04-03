import React from 'react';
import { useChatBox } from '@/components/core/chat/ChatContainer/ChatBox/hooks/useChatBox';
import type { ChatItemType } from '@fastgpt/global/core/chat/type';
import { Box, IconButton } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import { useContextSelector } from 'use-context-selector';
import { ChatContext } from '@/web/core/chat/context/chatContext';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import { useSandboxEditor, useSandboxStatus } from './SandboxEditor/hook';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import { useSystem } from '@fastgpt/web/hooks/useSystem';

const ToolMenu = ({
  history,
  reserveSpace
}: {
  history: ChatItemType[];
  reserveSpace?: boolean;
}) => {
  const { t } = useTranslation();
  const { isPc } = useSystem();
  const { onExportChat } = useChatBox();

  const onChangeChatId = useContextSelector(ChatContext, (v) => v.onChangeChatId);
  const chatData = useContextSelector(ChatItemContext, (v) => v.chatBoxData);
  const { chatId, outLinkAuthData } = useChatStore();

  // Status Hook: 顶层单例，负责网络同步与入口图标显示
  const { sandboxExists, setSandboxExists, SandboxEntryIcon } = useSandboxStatus({
    appId: chatData.appId,
    chatId,
    outLinkAuthData
  });

  // UI Hook: 负责弹窗渲染
  const { SandboxEditorModal, onOpenSandboxModal } = useSandboxEditor({
    appId: chatData.appId,
    chatId,
    outLinkAuthData
  });

  return (
    <>
      {isPc && <SandboxEntryIcon onOpen={onOpenSandboxModal} />}
      <MyMenu
        Button={
          <Box transform={reserveSpace ? 'translateX(-32px)' : 'none'}>
            <IconButton
              icon={<MyIcon name={'more'} w={'14px'} p={2} />}
              aria-label={''}
              size={'sm'}
              variant={reserveSpace ? 'transparentBase' : 'whitePrimary'}
            />
          </Box>
        }
        menuList={[
          {
            children: [
              {
                icon: 'core/chat/chatLight',
                label: t('common:core.chat.New Chat'),
                onClick: () => {
                  onChangeChatId();
                  setSandboxExists(false);
                }
              }
            ]
          },
          {
            children: [
              // {
              //   icon: 'core/app/appApiLight',
              //   label: `HTML ${t('common:Export')}`,
              //   onClick: () => onExportChat({ type: 'html', history })
              // },
              {
                icon: 'file/markdown',
                label: `Markdown ${t('common:Export')}`,
                onClick: () => onExportChat({ type: 'md', history })
              },
              ...(!isPc && sandboxExists
                ? [
                    {
                      icon: 'core/app/sandbox/file' as const,
                      label: t('chat:sandox.files'),
                      onClick: () => onOpenSandboxModal()
                    }
                  ]
                : [])
              // {
              //   icon: 'core/chat/export/pdf',
              //   label: `PDF ${t('common:Export')}`,
              //   onClick: () => onExportChat({ type: 'pdf', history })
              // }
            ]
          }
        ]}
      />
      <SandboxEditorModal />
    </>
  );
};

export default ToolMenu;
