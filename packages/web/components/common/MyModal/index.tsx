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
import MyBox from '../MyBox';
import { useSystem } from '../../../hooks/useSystem';
import Avatar from '../Avatar';

export interface MyModalProps extends ModalContentProps {
  iconSrc?: string;
  title?: any;
  isCentered?: boolean;
  isLoading?: boolean;
  isOpen: boolean;
  onClose?: () => void;
}

const MyModal = ({
  isOpen,
  onClose,
  iconSrc,
  title,
  children,
  isCentered,
  isLoading,
  w = 'auto',
  maxW = ['90vw', '600px'],
  ...props
}: MyModalProps) => {
  const isPc = useSystem();

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => onClose && onClose()}
      autoFocus={false}
      isCentered={isPc ? isCentered : true}
      blockScrollOnMount={false}
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
                  objectFit={'contain'}
                  alt=""
                  src={iconSrc}
                  w={'1.5rem'}
                  borderRadius={'md'}
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
