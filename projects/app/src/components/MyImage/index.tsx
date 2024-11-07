import React, { useState } from 'react';
import { Skeleton, ImageProps } from '@chakra-ui/react';
import CustomImage from '@fastgpt/web/components/common/Image/MyImage';

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
      <CustomImage
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
