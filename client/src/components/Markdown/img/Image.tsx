import React, { useState } from 'react';
import { Image, Skeleton } from '@chakra-ui/react';

const MdImage = ({ src }: { src?: string }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [succeed, setSucceed] = useState(false);
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
        fallbackSrc={'/imgs/errImg.png'}
        fallbackStrategy={'onError'}
        cursor={succeed ? 'pointer' : 'default'}
        loading="eager"
        onLoad={() => {
          setIsLoading(false);
          setSucceed(true);
        }}
        onError={() => setIsLoading(false)}
        onClick={() => {
          if (!succeed) return;
          window.open(src, '_blank');
        }}
      />
    </Skeleton>
  );
};

export default React.memo(MdImage);
