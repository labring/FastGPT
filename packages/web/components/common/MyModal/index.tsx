import React from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalContentProps,
  Box,
  Image,
  useMediaQuery
} from '@chakra-ui/react';
import MyIcon from '../Icon';
import MyBox from '../MyBox';

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
  const [isPc] = useMediaQuery('(min-width: 900px)');

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
