import React from 'react';
import { useChatBox } from '@/components/core/chat/ChatContainer/ChatBox/hooks/useChatBox';
import type { ChatItemType } from '@fastgpt/global/core/chat/type.d';
import { Box, IconButton } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import { useContextSelector } from 'use-context-selector';
import { ChatContext } from '@/web/core/chat/context/chatContext';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';

const ToolMenu = ({
  history,
  reserveSpace
}: {
  history: ChatItemType[];
  reserveSpace?: boolean;
}) => {
  const { t } = useTranslation();
  const { onExportChat } = useChatBox();

  const onChangeChatId = useContextSelector(ChatContext, (v) => v.onChangeChatId);
  const chatData = useContextSelector(ChatItemContext, (v) => v.chatBoxData);

  return (
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
            }
            // {
            //   icon: 'core/chat/export/pdf',
            //   label: `PDF ${t('common:Export')}`,
            //   onClick: () => onExportChat({ type: 'pdf', history })
            // }
          ]
        }
      ]}
    />
  );
};

export default ToolMenu;
