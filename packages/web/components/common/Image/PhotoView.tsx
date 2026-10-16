import React from 'react';
import { PhotoProvider, PhotoSlider, PhotoView } from 'react-photo-view';
import 'react-photo-view/dist/react-photo-view.css';
import { type ImageProps } from '@chakra-ui/react';
import { useSystem } from '../../../hooks/useSystem';
import Loading from '../MyLoading';
import MyImage from './MyImage';

type PhotoSliderImage = React.ComponentProps<typeof PhotoSlider>['images'][number];

type MyPhotoSliderProps = {
  src?: string;
  visible: boolean;
  onClose: () => void;
  imageKey?: string;
  initialScale?: number;
  render?: PhotoSliderImage['render'];
  width?: number;
  height?: number;
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

export const MyPhotoSlider = ({
  src,
  visible,
  onClose,
  imageKey,
  initialScale = 1,
  render,
  width,
  height
}: MyPhotoSliderProps) => {
  const { isPc } = useSystem();
  const scaleKey = `${imageKey || src || 'custom-render'}:${initialScale}`;
  const appliedScaleKey = React.useRef<string>();
  const images = (() => {
    if (!src && !render) return [];

    return [
      {
        key: imageKey || src || 'custom-render',
        src,
        render,
        width,
        height
      }
    ];
  })();

  React.useEffect(() => {
    if (!visible) {
      appliedScaleKey.current = undefined;
    }
  }, [visible, scaleKey]);

  return (
    <PhotoSlider
      images={images}
      visible={visible}
      onClose={onClose}
      maskOpacity={0.6}
      bannerVisible={!isPc}
      photoClosable
      loadingElement={<Loading fixed={false} />}
      // react-photo-view 默认会把整图适配到视口，Mermaid 预览需要恢复调用方的原始刻度。
      overlayRender={
        initialScale > 1
          ? ({ onScale }) => {
              if (appliedScaleKey.current !== scaleKey) {
                appliedScaleKey.current = scaleKey;
                window.requestAnimationFrame(() => {
                  if (visible) onScale(initialScale);
                });
              }
              return null;
            }
          : undefined
      }
    />
  );
};

export default MyPhotoView;
