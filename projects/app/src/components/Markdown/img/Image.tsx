import React from 'react';
import { Skeleton } from '@chakra-ui/react';
import MyPhotoView from '@fastgpt/web/components/common/Image/PhotoView';
import { useBoolean } from 'ahooks';

const MdImage = ({ src }: { src?: string }) => {
  const [isLoaded, { setTrue }] = useBoolean(false);

  return (
    <Skeleton isLoaded={isLoaded}>
      <MyPhotoView
        borderRadius={'md'}
        src={src}
        alt={''}
        fallbackSrc={'/imgs/errImg.png'}
        fallbackStrategy={'onError'}
        loading="lazy"
        objectFit={'contain'}
        referrerPolicy="no-referrer"
        minW={'120px'}
        minH={'120px'}
        maxH={'500px'}
        my={1}
        onLoad={() => {
          setTrue();
        }}
        onError={() => {
          setTrue();
        }}
      />
    </Skeleton>
  );
};

export default React.memo(MdImage);
