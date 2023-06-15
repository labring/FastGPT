import React, { useState } from 'react';
import { Image, Skeleton } from '@chakra-ui/react';

const MdImage = ({ src }: { src: string }) => {
  const [isLoading, setIsLoading] = useState(true);
  return (
    <Skeleton minH="60px" isLoaded={!isLoading} fadeDuration={2}>
      <Image
        src={src}
        alt={''}
        fallbackSrc={'/imgs/errImg.png'}
        onLoad={() => setIsLoading(false)}
        onError={() => setIsLoading(false)}
      />
    </Skeleton>
  );
};

export default MdImage;
