import React, { useEffect } from 'react';
import { Box, type BoxProps } from '@chakra-ui/react';
import MyBox from '@fastgpt/web/components/common/MyBox';

export type AppDetailPanelModalProps = {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  width: BoxProps['w'];
  height: BoxProps['h'];
  top?: BoxProps['top'];
  position?: BoxProps['position'];
  showMask?: boolean;
  closeOnMaskClick?: boolean;
  contentProps?: Omit<BoxProps, 'children'>;
};

/**
 * 应用详情页右侧弹窗，直接复用运行预览原有的宽高过渡和视觉样式。
 * 调用方只负责提供弹窗尺寸；无蒙层时，弹窗外区域仍可正常操作。
 */
const AppDetailPanelModal = ({
  isOpen,
  onClose,
  children,
  width,
  height,
  top = 0,
  position = 'absolute',
  showMask = true,
  closeOnMaskClick = true,
  contentProps
}: AppDetailPanelModalProps) => {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <>
      {showMask && (
        <Box
          zIndex={300}
          display={isOpen ? 'block' : 'none'}
          position={'fixed'}
          top={0}
          left={0}
          bottom={0}
          right={0}
          onClick={closeOnMaskClick ? onClose : undefined}
        />
      )}
      <MyBox
        zIndex={300}
        display={'flex'}
        flexDirection={'column'}
        position={position}
        top={top}
        right={0}
        h={isOpen ? height : 0}
        w={isOpen ? width : 0}
        minW={0}
        minH={0}
        bg={'white'}
        boxShadow={'3px 0 20px rgba(0,0,0,0.2)'}
        borderRadius={'md'}
        overflow={'hidden'}
        pointerEvents={isOpen ? 'auto' : 'none'}
        transition={'.2s ease'}
        {...contentProps}
      >
        {children}
      </MyBox>
    </>
  );
};

export default React.memo(AppDetailPanelModal);
