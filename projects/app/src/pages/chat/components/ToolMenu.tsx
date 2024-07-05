import React, { useMemo } from 'react';
import { useChatBox } from '@/components/ChatBox/hooks/useChatBox';
import type { ChatItemType } from '@fastgpt/global/core/chat/type.d';
import { Box, IconButton } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useRouter } from 'next/router';
import MyMenu from '@fastgpt/web/components/common/MyMenu';

const ToolMenu = ({ history }: { history: ChatItemType[] }) => {
  const { t } = useTranslation();
  const { onExportChat } = useChatBox();
  const router = useRouter();

  return history.length > 0 ? (
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
              label: t('core.chat.New Chat'),
              onClick: () => {
                router.replace({
                  query: {
                    ...router.query,
                    chatId: ''
                  }
                });
              }
            }
          ]
        },
        {
          children: [
            // {
            //   icon: 'core/app/appApiLight',
            //   label: `HTML ${t('Export')}`,
            //   onClick: () => onExportChat({ type: 'html', history })
            // },
            {
              icon: 'file/markdown',
              label: `Markdown ${t('Export')}`,
              onClick: () => onExportChat({ type: 'md', history })
            }
            // {
            //   icon: 'core/chat/export/pdf',
            //   label: `PDF ${t('Export')}`,
            //   onClick: () => onExportChat({ type: 'pdf', history })
            // }
          ]
        }
      ]}
    />
  ) : (
    <Box w={'28px'} h={'28px'} />
  );
};

export default ToolMenu;
