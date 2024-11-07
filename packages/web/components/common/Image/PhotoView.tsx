import React from 'react';
import { PhotoProvider, PhotoView } from 'react-photo-view';
import 'react-photo-view/dist/react-photo-view.css';
import { ImageProps } from '@chakra-ui/react';
import { useSystem } from '../../../hooks/useSystem';
import Loading from '../MyLoading';
import MyImage from './MyImage';

const MyPhotoView = ({ ...props }: ImageProps) => {
  const { isPc } = useSystem();
  return (
    <PhotoProvider
      maskOpacity={0.6}
      bannerVisible={!isPc}
      photoClosable
      loadingElement={<Loading fixed={false} />}
    >
      <PhotoView src={props.src}>
        <MyImage cursor={'pointer'} {...props} />
      </PhotoView>
    </PhotoProvider>
  );
};

export default MyPhotoView;
