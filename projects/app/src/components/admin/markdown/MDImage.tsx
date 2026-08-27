import React, { useState } from 'react';
import { Skeleton, useDisclosure } from '@chakra-ui/react';
import MyImage from '@fastgpt/web/components/common/Image/MyImage';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';

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
      <MyImage
        display={'inline-block'}
        borderRadius={'md'}
        border={'1px solid #ccc'}
        src={src}
        alt={''}
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
      <MyModal
        isOpen={isOpen}
        onClose={onClose}
        size="xl"
        w="100vw"
        maxW="100vw"
        h="100vh"
        maxH="100vh"
        bodyStyles={{ p: 0 }}
      >
        <MyImage
          src={src}
          alt={''}
          fallbackSrc={'/imgs/errImg.png'}
          fallbackStrategy={'onError'}
          loading="eager"
          objectFit={'contain'}
        />
      </MyModal>
    </Skeleton>
  );
};

export default React.memo(MdImage);
