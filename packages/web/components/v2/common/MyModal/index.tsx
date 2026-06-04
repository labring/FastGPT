import React from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalCloseButton,
  type ModalContentProps,
  Box,
  Flex,
  type FlexProps,
  type BoxProps
} from '@chakra-ui/react';
import MyBox from '../../../common/MyBox';
import { useSystem } from '../../../../hooks/useSystem';

export interface MyModalProps extends ModalContentProps {
  title?: any;
  isCentered?: boolean;
  isLoading?: boolean;
  isOpen?: boolean;
  onClose?: () => void;
  closeOnOverlayClick?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
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
  },
  xl: {
    w: '900px'
  }
};

const MyModal = ({
  isOpen = true,
  onClose,
  title,
  children,
  isCentered,
  isLoading,
  closeOnOverlayClick = true,
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
            pt={8}
            pb={0}
            gap={3}
            {...headerStyles}
          >
            <Box
              color="black"
              fontWeight={'500'}
              fontSize={'20px'}
              lineHeight={'26px'}
              letterSpacing={'0.15px'}
            >
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
          pt={title ? 6 : 8}
          pb={footer ? 6 : 8}
          fontSize={'14px'}
          lineHeight={'20px'}
          letterSpacing={'0.25px'}
          color={'myGray.900'}
          {...bodyStyles}
        >
          {children}
        </MyBox>

        {!!footer && (
          <Flex
            justifyContent={'flex-end'}
            gap={3}
            px={8}
            pb={8}
            pt={0}
            fontSize={'12px'}
            lineHeight={'16px'}
            letterSpacing={'0.5px'}
            {...footerStyles}
          >
            {footer}
          </Flex>
        )}
      </ModalContent>
    </Modal>
  );
};

export default React.memo(MyModal);
