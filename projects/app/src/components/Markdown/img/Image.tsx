import React, { useState, useEffect } from 'react';
import { Box, type ImageProps, Skeleton } from '@chakra-ui/react';
import MyPhotoView from '@fastgpt/web/components/common/Image/PhotoView';
import { useBoolean } from 'ahooks';
import { useTranslation } from 'next-i18next';
import { getPresignedDatasetFileGetUrl } from '@/web/core/dataset/api';
import { getPresignedChatFileGetUrl } from '@/web/common/file/api';
import type { AProps } from '../A';

const MdImage = ({
  src,
  ...props
}: { src?: string } & ImageProps & { chatAuthData?: AProps['chatAuthData'] }) => {
  const { t } = useTranslation();
  const [isLoaded, { setTrue }] = useBoolean(false);
  const [renderSrc, setRenderSrc] = useState(src);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!src || (!src.startsWith('dataset/') && !src.startsWith('chat/'))) {
      setRenderSrc(src);
      return;
    }

    const loadS3Image = async () => {
      try {
        setIsLoading(true);
        if (src.startsWith('dataset/')) {
          const url = await getPresignedDatasetFileGetUrl({ key: src });
          setRenderSrc(url);
        } else if (src.startsWith('chat/')) {
          const url = await getPresignedChatFileGetUrl({
            key: src,
            appId: props.chatAuthData?.appId || '',
            outLinkAuthData: {
              shareId: props.chatAuthData?.shareId,
              outLinkUid: props.chatAuthData?.outLinkUid,
              teamId: props.chatAuthData?.teamId,
              teamToken: props.chatAuthData?.teamToken
            }
          });
          setRenderSrc(url);
        }
      } catch (error) {
        console.error('Failed to sign S3 image:', error);
        setRenderSrc('/imgs/errImg.png');
      } finally {
        setIsLoading(false);
      }
    };

    loadS3Image();
  }, [src, props.chatAuthData]);

  if (src?.includes('base64') && !src.startsWith('data:image')) {
    return <Box>Invalid base64 image</Box>;
  }

  if (props.alt?.startsWith('OFFIACCOUNT_MEDIA')) {
    return <Box>{t('common:not_support_wechat_image')}</Box>;
  }

  return (
    <Skeleton isLoaded={isLoaded && !isLoading}>
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
