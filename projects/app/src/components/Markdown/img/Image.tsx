import React, { useState } from 'react';
import {
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
  return (
    <Skeleton
      minH="100px"
      isLoaded={!isLoading}
      fadeDuration={2}
      display={'flex'}
      justifyContent={'center'}
      my={1}
    >
      <Image
        display={'inline-block'}
        borderRadius={'md'}
        src={src}
        alt={''}
        maxH={'150px'}
        fallbackSrc={'/imgs/errImg.png'}
        fallbackStrategy={'onError'}
        cursor={succeed ? 'pointer' : 'default'}
        loading="eager"
        objectFit={'contain'}
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
      <Modal isOpen={isOpen} onClose={onClose}>
        <ModalOverlay />
        <ModalContent m={'auto'}>
          <Image
            src={src}
            alt={''}
            fallbackSrc={'/imgs/errImg.png'}
            fallbackStrategy={'onError'}
            loading="eager"
            objectFit={'contain'}
          />
        </ModalContent>
        <ModalCloseButton bg={'myWhite.500'} zIndex={999999} />
      </Modal>
    </Skeleton>
  );
};

export default React.memo(MdImage);
