import React, { useState } from 'react';
import { Skeleton, type ImageProps } from '@chakra-ui/react';
import CustomImage from '@fastgpt/web/components/common/Image/MyImage';

export const MyImage = (props: ImageProps) => {
  const [succeed, setSucceed] = useState(false);

  return (
    <CustomImage
      title={'Preview image'}
      display={'inline-block'}
      borderRadius={'md'}
      alt={''}
      fallbackSrc={'/imgs/errImg.png'}
      fallbackStrategy={'onError'}
      cursor={succeed ? 'pointer' : 'default'}
      objectFit={'contain'}
      loading={'lazy'}
      onLoad={() => {
        setSucceed(true);
      }}
      onClick={() => {
        if (!succeed) return;
        window.open(props.src, '_blank');
      }}
      {...props}
    />
  );
};

export default React.memo(MyImage);
