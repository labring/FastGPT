import React from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalContentProps,
  Box,
  Image
} from '@chakra-ui/react';
import MyIcon from '../Icon';

export interface MyModalProps extends ModalContentProps {
  iconSrc?: string;
  title?: any;
  isCentered?: boolean;
  isOpen: boolean;
  onClose?: () => void;
  isPc?: boolean;
}

const CustomModal = ({
  isOpen,
  onClose,
  iconSrc,
  title,
  children,
  isCentered,
  w = 'auto',
  maxW = ['90vw', '600px'],
  ...props
}: MyModalProps) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={() => onClose && onClose()}
      autoFocus={false}
      isCentered={isCentered}
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
            fontWeight={500}
            background={'#FBFBFC'}
            borderBottom={'1px solid #F4F6F8'}
            roundedTop={'lg'}
            py={'10px'}
          >
            {iconSrc && (
              <>
                {iconSrc.startsWith('/') ? (
                  <Image mr={3} objectFit={'contain'} alt="" src={iconSrc} w={'20px'} />
                ) : (
                  <MyIcon mr={3} name={iconSrc as any} w={'20px'} />
                )}
              </>
            )}
            {title}
            <Box flex={1} />
            {onClose && (
              <ModalCloseButton position={'relative'} fontSize={'sm'} top={0} right={0} />
            )}
          </ModalHeader>
        )}

        <Box
          overflow={props.overflow || 'overlay'}
          h={'100%'}
          display={'flex'}
          flexDirection={'column'}
        >
          {children}
        </Box>
      </ModalContent>
    </Modal>
  );
};

export default CustomModal;
