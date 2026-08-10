import React, { useEffect } from 'react';
import { Box, Flex, type BoxProps, type FlexProps } from '@chakra-ui/react';
import MyBox from '@fastgpt/web/components/common/MyBox';

export type AppDetailPanelModalProps = {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  header: React.ReactNode;
  footer?: React.ReactNode;
  isLoading?: boolean;
  width: BoxProps['w'];
  height: BoxProps['h'];
  headerProps?: Omit<FlexProps, 'children'>;
  top?: BoxProps['top'];
  position?: BoxProps['position'];
  placement?: 'left' | 'right';
  showMask?: boolean;
  closeOnMaskClick?: boolean;
  contentProps?: Omit<BoxProps, 'children'>;
};

export const APP_DETAIL_PANEL_WIDTH_PX = 400;

/**
 * 应用详情页侧边弹窗，直接复用运行预览原有的宽高过渡和视觉样式。
 * 面板固定拆成顶部、主体、底部三段；调用方只负责提供各段内容和弹窗尺寸。
 * 无蒙层时，弹窗外区域仍可正常操作。
 */
const AppDetailPanelModal = ({
  isOpen,
  onClose,
  children,
  header,
  footer,
  isLoading = false,
  width,
  height,
  headerProps,
  top = 0,
  position = 'absolute',
  placement = 'right',
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
        isLoading={isLoading}
        zIndex={300}
        display={'flex'}
        flexDirection={'column'}
        position={position}
        top={top}
        left={placement === 'left' ? 0 : undefined}
        right={placement === 'right' ? 0 : undefined}
        h={isOpen ? height : 0}
        w={isOpen ? width : 0}
        minW={0}
        minH={0}
        bg={'white'}
        boxShadow={'3px 0 20px rgba(0,0,0,0.2)'}
        borderRadius={'md'}
        overflow={'hidden'}
        pointerEvents={isOpen ? 'auto' : 'none'}
        transition={'width 0.2s ease, height 0.2s ease'}
        willChange={'width, height'}
        {...contentProps}
      >
        <Flex
          minH={'56px'}
          flexShrink={0}
          px={'24px'}
          bg={'white'}
          fontWeight={500}
          fontSize={'md'}
          color={'myGray.900'}
          alignItems={'center'}
          position={'relative'}
          {...headerProps}
        >
          {header}
        </Flex>
        <Flex flex={'1 0 0'} minH={0} h={0} alignItems={'stretch'} flexDirection={'column'}>
          {children}
        </Flex>
        {footer && (
          <Flex minH={'56px'} flexShrink={0} px={'24px'} alignItems={'center'}>
            {footer}
          </Flex>
        )}
      </MyBox>
    </>
  );
};

export default React.memo(AppDetailPanelModal);
