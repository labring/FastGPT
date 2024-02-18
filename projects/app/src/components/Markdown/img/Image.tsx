import React, { WheelEventHandler, useState } from 'react';
import {
  Box,
  Image,
  Modal,
  ModalCloseButton,
  ModalContent,
  ModalOverlay,
  Skeleton,
  useDisclosure
} from '@chakra-ui/react';

const MdImage = ({ src }: { src?: string }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [succeed, setSucceed] = useState(false);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [scale, setScale] = useState(1);

  const handleWheel: WheelEventHandler<HTMLImageElement> = (e) => {
    setScale((prevScale) => {
      const newScale = prevScale + e.deltaY * 0.5 * -0.01;
      if (newScale < 0.5) return 0.5;
      if (newScale > 10) return 10;
      return newScale;
    });
  };

  return (
    <>
      <Image
        borderRadius={'md'}
        src={src}
        alt={''}
        fallbackSrc={'/imgs/errImg.png'}
        fallbackStrategy={'onError'}
        cursor={succeed ? 'pointer' : 'default'}
        loading="lazy"
        objectFit={'contain'}
        referrerPolicy="no-referrer"
        minW={'120px'}
        minH={'120px'}
        my={1}
        onLoad={() => {
          setIsLoading(false);
          setSucceed(true);
        }}
        onError={() => setIsLoading(false)}
        onClick={() => {
          if (!succeed) return;
          onOpen();
        }}
      />
      <Modal isOpen={isOpen} onClose={onClose} isCentered>
        <ModalOverlay />
        <ModalContent boxShadow={'none'} maxW={'auto'} w="auto" bg={'transparent'}>
          <Image
            transform={`scale(${scale})`}
            borderRadius={'md'}
            src={src}
            alt={''}
            w={'100%'}
            maxH={'80vh'}
            referrerPolicy="no-referrer"
            fallbackSrc={'/imgs/errImg.png'}
            fallbackStrategy={'onError'}
            objectFit={'contain'}
            onWheel={handleWheel}
          />
        </ModalContent>
        <ModalCloseButton bg={'myWhite.500'} zIndex={999999} />
      </Modal>
    </>
  );
};

export default React.memo(MdImage);
