import React from 'react';
import { PhotoProvider, PhotoView } from 'react-photo-view';
import 'react-photo-view/dist/react-photo-view.css';
import { Box, Image, ImageProps } from '@chakra-ui/react';
import { useSystem } from '../../../hooks/useSystem';
import Loading from '../MyLoading';

const MyPhotoView = ({
  forbidImgPreview,
  ...props
}: ImageProps & { forbidImgPreview?: boolean }) => {
  const { isPc } = useSystem();
  return forbidImgPreview ? (
    <Image {...props} />
  ) : (
    <PhotoProvider
      maskOpacity={0.6}
      bannerVisible={!isPc}
      photoClosable
      loadingElement={<Loading fixed={false} />}
    >
      <PhotoView src={props.src}>
        <Image cursor={'pointer'} {...props} />
      </PhotoView>
    </PhotoProvider>
  );
};

export default MyPhotoView;
