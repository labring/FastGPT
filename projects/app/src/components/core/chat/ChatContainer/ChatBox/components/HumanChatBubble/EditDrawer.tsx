import { Box, Flex } from '@chakra-ui/react';
import React from 'react';
import { useTranslation } from 'next-i18next';
import { Drawer } from 'vaul';
import HumanChatBubbleEditForm from './EditForm';
import type { ChatBoxInputType } from '../../type';

type HumanChatBubbleEditDrawerProps = {
  isOpen: boolean;
  defaultValue: string;
  defaultFiles?: ChatBoxInputType['files'];
  onClose: () => void;
  onSubmit?: (input: ChatBoxInputType) => void | Promise<void>;
};

/**
 * 移动端用户消息编辑抽屉。
 *
 * 抽屉只负责移动端布局、标题和关闭入口，编辑表单本身继续复用桌面 inline 编辑态组件，
 * 保证更新按钮禁用、文本收集和后续提交逻辑只有一份。
 */
const HumanChatBubbleEditDrawer = ({
  isOpen,
  defaultValue,
  defaultFiles,
  onClose,
  onSubmit
}: HumanChatBubbleEditDrawerProps) => {
  const { t } = useTranslation();

  return (
    <Drawer.Root open={isOpen} onOpenChange={(open) => !open && onClose()} direction="bottom">
      <Drawer.Portal>
        <Drawer.Overlay
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.18)',
            zIndex: 1400
          }}
        />
        <Drawer.Content
          style={{
            position: 'fixed',
            right: 0,
            bottom: 0,
            left: 0,
            zIndex: 1401,
            outline: 'none'
          }}
        >
          <Box
            bg={'white'}
            borderTopRadius={'24px'}
            px={'16px'}
            pb={'calc(16px + env(safe-area-inset-bottom))'}
          >
            <Flex justifyContent={'center'} py={'16px'}>
              <Drawer.Handle style={{ backgroundColor: 'var(--chakra-colors-myGray-400)' }} />
            </Flex>

            <Flex alignItems={'center'} justifyContent={'center'} mb={5}>
              <Box fontSize={'16px'} lineHeight={'24px'} fontWeight={600} color={'myGray.900'}>
                {t('chat:edit_message')}
              </Box>
            </Flex>

            <HumanChatBubbleEditForm
              defaultValue={defaultValue}
              defaultFiles={defaultFiles}
              onCancel={onClose}
              onSubmit={(input) => {
                onSubmit?.(input);
                onClose();
              }}
              showCancel={false}
            />
          </Box>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
};

export default React.memo(HumanChatBubbleEditDrawer);
