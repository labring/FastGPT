import React, { useMemo, useState } from 'react';
import { useChatBox } from '@/components/core/chat/ChatContainer/ChatBox/hooks/useChatBox';
import type { ChatItemMiniType } from '@fastgpt/global/core/chat/type';
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
import type { ChatTypeEnum } from '@/components/core/chat/ChatContainer/ChatBox/constants';
import { getChatVariableGroups } from '@/components/core/chat/ChatContainer/ChatBox/components/ChatVariableForm';
import { ChatVariableDrawer } from './ChatWindow/ChatVariableButton';
import {
  chatHeaderIconButtonStyle,
  mobileChatHeaderIconButtonStyle
} from './ChatWindow/headerIconButtonStyle';

const ToolMenu = ({
  history,
  reserveSpace,
  chatType
}: {
  history: ChatItemMiniType[];
  reserveSpace?: boolean;
  chatType?: ChatTypeEnum;
}) => {
  const { t } = useTranslation();
  const { isPc } = useSystem();
  const { onExportChat } = useChatBox();
  const [isVariableDrawerOpen, setIsVariableDrawerOpen] = useState(false);

  const onChangeChatId = useContextSelector(ChatContext, (v) => v.onChangeChatId);
  const chatData = useContextSelector(ChatItemContext, (v) => v.chatBoxData);
  const variables = useContextSelector(
    ChatItemContext,
    (v) => v.chatBoxData?.app?.chatConfig?.variables ?? []
  );
  const { chatId, outLinkAuthData, appId, source } = useChatStore();
  const currentAppId = chatData.appId || appId;
  const isShareAuthReady =
    source !== 'share' || (!!outLinkAuthData.shareId && !!outLinkAuthData.outLinkUid);
  const hasVariables = useMemo(() => {
    if (!chatType) return false;
    const { commonVariableList, externalVariableList, internalVariableList } =
      getChatVariableGroups({
        variables,
        chatType
      });
    return (
      commonVariableList.length + externalVariableList.length + internalVariableList.length > 0
    );
  }, [chatType, variables]);

  // Status Hook: 顶层单例，负责网络同步与入口图标显示
  const { sandboxExists, setSandboxExists, SandboxEntryIcon } = useSandboxStatus({
    appId: isShareAuthReady ? currentAppId : '',
    chatId,
    outLinkAuthData
  });

  // UI Hook: 负责弹窗渲染
  const { SandboxEditorModal, onOpenSandboxModal } = useSandboxEditor({
    appId: currentAppId,
    chatId,
    outLinkAuthData
  });

  const showMenu = history.length > 0 || (!isPc && (hasVariables || sandboxExists));

  if (!showMenu && !isPc) {
    return null;
  }

  return (
    <>
      {isPc && <SandboxEntryIcon onOpen={onOpenSandboxModal} />}
      <MyMenu
        Button={
          <Box transform={reserveSpace ? 'translateX(-32px)' : 'none'}>
            <IconButton
              icon={
                <MyIcon
                  name={'more'}
                  w={'14px'}
                  color="currentColor"
                  sx={{
                    '& path': {
                      fill: 'currentColor'
                    }
                  }}
                />
              }
              aria-label={''}
              size={'sm'}
              variant="unstyled"
              {...(isPc ? chatHeaderIconButtonStyle : mobileChatHeaderIconButtonStyle)}
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
              },
              // {
              //   icon: 'core/app/appApiLight',
              //   label: `HTML ${t('common:Export')}`,
              //   onClick: () => onExportChat({ type: 'html', history })
              // },
              ...(history.length > 0
                ? [
                    {
                      icon: 'core/chat/markdown' as const,
                      label: `Markdown ${t('common:Export')}`,
                      onClick: () => onExportChat({ type: 'md', history })
                    }
                  ]
                : []),
              ...(!isPc && chatType && hasVariables
                ? [
                    {
                      icon: 'core/chat/var' as const,
                      label: t('common:core.module.Variable'),
                      onClick: () => setIsVariableDrawerOpen(true)
                    }
                  ]
                : []),
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
      {!isPc && chatType && isVariableDrawerOpen && (
        <ChatVariableDrawer
          isOpen={isVariableDrawerOpen}
          chatType={chatType}
          onClose={() => setIsVariableDrawerOpen(false)}
        />
      )}
    </>
  );
};

export default ToolMenu;
