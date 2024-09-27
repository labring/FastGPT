import React from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalContentProps,
  Box,
  ImageProps
} from '@chakra-ui/react';
import MyBox from '../MyBox';
import { useSystem } from '../../../hooks/useSystem';
import Avatar from '../Avatar';

export interface MyModalProps extends ModalContentProps {
  iconSrc?: string;
  iconColor?: ImageProps['color'];
  title?: any;
  isCentered?: boolean;
  isLoading?: boolean;
  isOpen?: boolean;
  onClose?: () => void;
  closeOnOverlayClick?: boolean;
  size?: 'md' | 'lg';
}

const MyModal = ({
  isOpen = true,
  onClose,
  iconSrc,
  title,
  children,
  isCentered,
  isLoading,
  w = 'auto',
  maxW = ['90vw', '600px'],
  closeOnOverlayClick = true,
  iconColor,
  size = 'md',
  ...props
}: MyModalProps) => {
  const { isPc } = useSystem();

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => onClose && onClose()}
      size={size}
      autoFocus={false}
      isCentered={isPc ? isCentered : true}
      blockScrollOnMount={false}
      closeOnOverlayClick={closeOnOverlayClick}
    >
      <ModalOverlay />
      <ModalContent
        w={w}
        minW={['90vw', '400px']}
        maxW={maxW}
        position={'relative'}
        maxH={'85vh'}
        boxShadow={'7'}
        {...props}
      >
        {!title && onClose && <ModalCloseButton zIndex={1} />}
        {!!title && (
          <ModalHeader
            display={'flex'}
            alignItems={'center'}
            background={'#FBFBFC'}
            borderBottom={'1px solid #F4F6F8'}
            roundedTop={'lg'}
            py={'10px'}
            fontSize={'md'}
            fontWeight={'bold'}
          >
            {iconSrc && (
              <>
                <Avatar
                  color={iconColor}
                  objectFit={'contain'}
                  alt=""
                  src={iconSrc}
                  w={'1.5rem'}
                  borderRadius={'sm'}
                />
              </>
            )}
            <Box ml={3} color={'myGray.900'} fontWeight={'500'}>
              {title}
            </Box>
            <Box flex={1} />
            {onClose && (
              <ModalCloseButton position={'relative'} fontSize={'xs'} top={0} right={0} />
            )}
          </ModalHeader>
        )}

        <MyBox
          isLoading={isLoading}
          overflow={props.overflow || 'overlay'}
          h={'100%'}
          display={'flex'}
          flexDirection={'column'}
        >
          {children}
        </MyBox>
      </ModalContent>
    </Modal>
  );
};

export default React.memo(MyModal);
