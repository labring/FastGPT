import React from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalCloseButton,
  type ModalContentProps,
  Box,
  type ImageProps,
  Flex,
  type FlexProps,
  type BoxProps
} from '@chakra-ui/react';
import MyBox from '../../../common/MyBox';
import { useSystem } from '../../../../hooks/useSystem';
import Avatar from '../../../common/Avatar';

export interface MyModalProps extends ModalContentProps {
  iconSrc?: string;
  iconColor?: ImageProps['color'];
  title?: any;
  isCentered?: boolean;
  isLoading?: boolean;
  isOpen?: boolean;
  onClose?: () => void;
  closeOnOverlayClick?: boolean;
  size?: 'sm' | 'md' | 'lg';
  showCloseButton?: boolean;
  footer?: React.ReactNode;
  headerStyles?: FlexProps;
  bodyStyles?: BoxProps;
  footerStyles?: FlexProps;
}

const sizeMap = {
  sm: {
    w: '400px'
  },
  md: {
    w: '560px'
  },
  lg: {
    w: '800px'
  }
};

const MyModal = ({
  isOpen = true,
  onClose,
  iconSrc,
  title,
  children,
  isCentered,
  isLoading,
  closeOnOverlayClick = true,
  iconColor,
  size = 'sm',
  showCloseButton = true,
  headerStyles,
  bodyStyles,
  footerStyles,
  footer,
  ...props
}: MyModalProps) => {
  const { isPc } = useSystem();

  const sizeData = sizeMap[size] || sizeMap.sm;

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => onClose?.()}
      size={size}
      autoFocus={false}
      isCentered={isPc ? isCentered : true}
      blockScrollOnMount={false}
      allowPinchZoom
      scrollBehavior={'inside'}
      closeOnOverlayClick={closeOnOverlayClick}
      returnFocusOnClose={false}
    >
      <ModalOverlay zIndex={props.zIndex} />
      <ModalContent
        w={sizeData.w}
        maxW={'90vw'}
        position={'relative'}
        maxH={'80vh'}
        boxShadow={'3.5'}
        px={0}
        py={0}
        display={'flex'}
        flexDirection={'column'}
        gap={'24px'}
        containerProps={{
          zIndex: props.zIndex
        }}
        {...props}
      >
        {onClose && showCloseButton && (
          <ModalCloseButton position={'absolute'} fontSize={'xs'} top={3} right={3} />
        )}

        {!!title && (
          <Flex
            alignItems={'center'}
            fontSize={'lg'}
            fontWeight={'500'}
            px={8}
            pt={6}
            pb={0}
            gap={3}
            {...headerStyles}
          >
            {iconSrc && (
              <Avatar
                color={iconColor}
                objectFit={'contain'}
                alt=""
                src={iconSrc}
                w={'20px'}
                borderRadius={'sm'}
              />
            )}
            <Box color="black" fontWeight={'500'}>
              {title}
            </Box>
          </Flex>
        )}

        <MyBox
          isLoading={isLoading}
          overflow={props.overflow || 'overlay'}
          h={'100%'}
          display={'flex'}
          flexDirection={'column'}
          px={8}
          pt={title ? 0 : 8}
          pb={footer ? 0 : 8}
          {...bodyStyles}
        >
          {children}
        </MyBox>

        {!!footer && (
          <Flex justifyContent={'flex-end'} gap={3} px={8} pb={6} pt={0} {...footerStyles}>
            {footer}
          </Flex>
        )}
      </ModalContent>
    </Modal>
  );
};

export default React.memo(MyModal);
