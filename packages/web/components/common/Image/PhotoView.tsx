import React from 'react';
import { PhotoProvider, PhotoSlider, PhotoView } from 'react-photo-view';
import 'react-photo-view/dist/react-photo-view.css';
import { type ImageProps } from '@chakra-ui/react';
import { useSystem } from '../../../hooks/useSystem';
import Loading from '../MyLoading';
import MyImage from './MyImage';

type MyPhotoSliderProps = {
  src?: string;
  visible: boolean;
  onClose: () => void;
  imageKey?: string;
};

const MyPhotoView = (props: ImageProps) => {
  const { isPc } = useSystem();

  return (
    <PhotoProvider
      maskOpacity={0.6}
      bannerVisible={!isPc}
      photoClosable
      loadingElement={<Loading fixed={false} />}
    >
      <PhotoView src={props.src}>
        <MyImage cursor={'pointer'} {...props} title={props.title || props.src} />
      </PhotoView>
    </PhotoProvider>
  );
};

export const MyPhotoSlider = ({ src, visible, onClose, imageKey }: MyPhotoSliderProps) => {
  const { isPc } = useSystem();

  return (
    <PhotoSlider
      images={src ? [{ key: imageKey || src, src }] : []}
      visible={visible}
      onClose={onClose}
      maskOpacity={0.6}
      bannerVisible={!isPc}
      photoClosable
      loadingElement={<Loading fixed={false} />}
    />
  );
};

export default MyPhotoView;
