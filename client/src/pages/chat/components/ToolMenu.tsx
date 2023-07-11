import React from 'react';
import { useChatBox } from '@/components/ChatBox';
import { ChatItemType } from '@/types/chat';
import { Menu, MenuButton, MenuList, MenuItem } from '@chakra-ui/react';
import MyIcon from '@/components/Icon';

const ToolMenu = ({ history }: { history: ChatItemType[] }) => {
  const { onExportChat } = useChatBox();
  return (
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
      <MenuList color={'myGray.700'} minW={`90px !important`}>
        <MenuItem onClick={() => onExportChat({ type: 'html', history })}>导出HTML格式</MenuItem>
        <MenuItem onClick={() => onExportChat({ type: 'pdf', history })}>导出PDF格式</MenuItem>
        <MenuItem onClick={() => onExportChat({ type: 'md', history })}>导出Markdown格式</MenuItem>
      </MenuList>
    </Menu>
  );
};

export default ToolMenu;
