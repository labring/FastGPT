import React, { type ReactNode } from 'react';
import { Box, Flex, VStack, type BoxProps } from '@chakra-ui/react';
import MyIcon from '../../../common/Icon';
import type { IconNameType } from '../../../common/Icon/type';
import MyModal, { type MyModalProps } from './index';

export type HighlightModalProps = Omit<
  MyModalProps,
  'title' | 'children' | 'footer' | 'footerStyles'
> & {
  title?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  icon?: ReactNode;
  iconName?: IconNameType;
  footerStyles?: BoxProps;
};

/**
 * 统一承载带顶部图标和背景图的强调型弹窗样式。
 *
 * 该组件只负责视觉结构，业务内容与底部操作通过 children/footer 传入，
 * 避免把商业版弹窗、升级弹窗等业务语义耦合在同一个组件里。
 */
const HighlightModal = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  icon,
  iconName = 'star',
  showCloseButton = false,
  bodyStyles,
  footerStyles,
  ...props
}: HighlightModalProps) => {
  return (
    <MyModal
      isOpen={isOpen}
      onClose={onClose}
      showCloseButton={showCloseButton}
      w={'400px'}
      minH={'392px'}
      isCentered
      bodyStyles={{
        userSelect: 'none',
        pt: 0,
        pb: 8,
        px: 6,
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        justifyContent: 'center',
        _before: {
          content: '""',
          position: 'absolute',
          left: 0,
          top: 0,
          w: '100%',
          h: '100%',
          bgImage: 'url(/imgs/proModalBg.png)',
          bgSize: '100% auto',
          bgPosition: 'top center',
          bgRepeat: 'no-repeat',
          opacity: 0.32,
          zIndex: -10
        },
        ...bodyStyles
      }}
      {...props}
    >
      <VStack w={'full'} alignItems={'center'} textAlign={'center'} gap={0}>
        <Flex h={'112px'} alignItems={'center'} justifyContent={'center'}>
          {icon ?? <MyIcon name={iconName} w={9} h={9} transform={'translateY(40%)'} />}
        </Flex>
        {!!title && (
          <Box color={'myGray.900'} fontSize={'26px'} fontWeight={'bold'} lineHeight={'34px'}>
            {title}
          </Box>
        )}
        {children}
        {!!footer && (
          <Box w={'full'} mt={6} {...footerStyles}>
            {footer}
          </Box>
        )}
      </VStack>
    </MyModal>
  );
};

export default React.memo(HighlightModal);
