import React, { useState } from 'react';
import { Image, Skeleton, ImageProps } from '@chakra-ui/react';

export const MyImage = (props: ImageProps) => {
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
        alt={''}
        fallbackSrc={'/imgs/errImg.png'}
        fallbackStrategy={'onError'}
        cursor={succeed ? 'pointer' : 'default'}
        objectFit={'contain'}
        loading={'lazy'}
        onLoad={() => {
          setIsLoading(false);
          setSucceed(true);
        }}
        onError={() => setIsLoading(false)}
        onClick={() => {
          if (!succeed) return;
          window.open(props.src, '_blank');
        }}
        {...props}
      />
    </Skeleton>
  );
};

export default React.memo(MyImage);
