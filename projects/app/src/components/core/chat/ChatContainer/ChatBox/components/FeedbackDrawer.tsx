import React from 'react';
import { Box } from '@chakra-ui/react';
import { Drawer } from 'vaul';

type FeedbackDrawerProps = {
  children: React.ReactNode;
  onClose: () => void;
};

/**
 * 移动端点踩反馈底部抽屉。
 *
 * 只服务 ChatBox 的反馈场景：使用 vaul 提供原生拖拽关闭和收起动画，
 * 避免把反馈弹窗的交互需求扩散到通用 PhoneDrawer。
 */
const FeedbackDrawer = ({ children, onClose }: FeedbackDrawerProps) => {
  return (
    <Drawer.Root open onOpenChange={(open) => !open && onClose()} direction="bottom" handleOnly>
      <Drawer.Portal>
        <Drawer.Overlay
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.16)',
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
          <Box bg="white" borderTopRadius="16px" px="16px" pb="50px">
            <Box py="16px">
              <Drawer.Handle style={{ backgroundColor: 'var(--chakra-colors-myGray-400)' }} />
            </Box>
            {children}
          </Box>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
};

export default React.memo(FeedbackDrawer);
