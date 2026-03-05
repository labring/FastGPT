import React, { useMemo } from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalCloseButton,
  type ModalContentProps,
  Box,
  type ImageProps,
  Flex
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
}

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
  ...props
}: MyModalProps) => {
  const { isPc } = useSystem();

  const sizeData = useMemo(() => {
    const map = {
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
    return map[size];
  }, [size]);

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
        padding={'8'}
        containerProps={{
          zIndex: props.zIndex
        }}
        {...props}
      >
        {onClose && <ModalCloseButton position={'absolute'} fontSize={'xs'} top={3} right={3} />}

        {!!title && (
          <Flex
            alignItems={'center'}
            fontSize={'lg'}
            fontWeight={'500'}
            mb={6}
            py={0}
            px={0}
            gap={3}
          >
            {iconSrc && (
              <>
                <Avatar
                  color={iconColor}
                  objectFit={'contain'}
                  alt=""
                  src={iconSrc}
                  w={'20px'}
                  borderRadius={'sm'}
                />
              </>
            )}
            <Box color="black" fontWeight={'500'}>
              {title}
            </Box>
            <Box flex={1} />
          </Flex>
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
