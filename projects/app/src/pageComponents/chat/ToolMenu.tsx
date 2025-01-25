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
import { useRouter } from 'next/router';

const ToolMenu = ({ history }: { history: ChatItemType[] }) => {
  const router = useRouter();
  const { t } = useTranslation();
  const { onExportChat } = useChatBox();

  const onChangeChatId = useContextSelector(ChatContext, (v) => v.onChangeChatId);
  const chatData = useContextSelector(ChatItemContext, (v) => v.chatBoxData);
  const showRouteToAppDetail = useContextSelector(ChatItemContext, (v) => v.showRouteToAppDetail);

  return (
    <MyMenu
      Button={
        <IconButton
          icon={<MyIcon name={'more'} w={'14px'} p={2} />}
          aria-label={''}
          size={'sm'}
          variant={'whitePrimary'}
        />
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
        },
        ...(showRouteToAppDetail
          ? [
              {
                children: [
                  {
                    icon: 'core/app/aiLight',
                    label: t('app:app_detail'),
                    onClick: () => router.push(`/app/detail?appId=${chatData.appId}`)
                  }
                ]
              }
            ]
          : [])
      ]}
    />
  );
};

export default ToolMenu;
