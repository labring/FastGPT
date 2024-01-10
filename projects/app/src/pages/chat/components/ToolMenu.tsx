import React, { useMemo } from 'react';
import { useChatBox } from '@/components/ChatBox';
import type { ChatItemType } from '@fastgpt/global/core/chat/type.d';
import { Menu, MenuButton, MenuList, MenuItem, Box } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useRouter } from 'next/router';

const ToolMenu = ({ history }: { history: ChatItemType[] }) => {
  const { t } = useTranslation();
  const { onExportChat } = useChatBox();
  const router = useRouter();

  const menuList = useMemo(
    () => [
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
      },
      {
        icon: 'core/app/appApiLight',
        label: `HTML ${t('Export')}`,
        onClick: () => onExportChat({ type: 'html', history })
      },
      {
        icon: 'file/markdown',
        label: `Markdown ${t('Export')}`,
        onClick: () => onExportChat({ type: 'md', history })
      },
      {
        icon: 'file/pdf',
        label: `PDF ${t('Export')}`,
        onClick: () => onExportChat({ type: 'pdf', history })
      }
    ],
    [history, onExportChat, router]
  );

  return history.length > 0 ? (
    <Menu autoSelect={false} isLazy>
      <MenuButton
        _hover={{ bg: 'myWhite.600  ' }}
        cursor={'pointer'}
        borderRadius={'md'}
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <MyIcon name={'more'} w={'14px'} p={2} />
      </MenuButton>
      <MenuList color={'myGray.700'} minW={`120px !important`} zIndex={10}>
        {menuList.map((item) => (
          <MenuItem key={item.label} onClick={item.onClick} py={[2, 3]}>
            <MyIcon name={item.icon as any} w={['14px', '16px']} />
            <Box ml={[1, 2]}>{item.label}</Box>
          </MenuItem>
        ))}
      </MenuList>
    </Menu>
  ) : (
    <Box w={'28px'} h={'28px'} />
  );
};

export default ToolMenu;
