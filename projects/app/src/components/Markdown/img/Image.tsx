import React, { useState } from 'react';
import { Box, type ImageProps, Skeleton } from '@chakra-ui/react';
import MyPhotoView from '@fastgpt/web/components/common/Image/PhotoView';
import { useBoolean } from 'ahooks';
import { useTranslation } from 'next-i18next';
import type { AProps } from '../A';

const MdImage = ({
  src,
  ...props
}: { src?: string } & ImageProps & { chatAuthData?: AProps['chatAuthData'] }) => {
  const { t } = useTranslation();
  const [isLoaded, { setTrue }] = useBoolean(false);
  const [renderSrc, setRenderSrc] = useState(src);

  if (src?.includes('base64') && !src.startsWith('data:image')) {
    return <Box>Invalid base64 image</Box>;
  }

  if (props.alt?.startsWith('OFFIACCOUNT_MEDIA')) {
    return <Box>{t('common:not_support_wechat_image')}</Box>;
  }

  return (
    <Skeleton isLoaded={isLoaded}>
      <MyPhotoView
        borderRadius={'md'}
        src={renderSrc}
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
        mx={'auto'}
        onLoad={() => {
          setTrue();
        }}
        onError={() => {
          setRenderSrc('/imgs/errImg.png');
          setTrue();
        }}
        {...props}
      />
    </Skeleton>
  );
};

export default MdImage;
