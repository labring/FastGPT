import React, { useCallback, useEffect, useState } from 'react';
import {
  Box,
  CircularProgress,
  Flex,
  Portal,
  type BoxProps,
  type FlexProps
} from '@chakra-ui/react';
import { isDatasetFileObjectKey } from '@fastgpt/global/core/dataset/utils';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { MyPhotoSlider } from '@fastgpt/web/components/common/Image/PhotoView';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { postGetSearchTestImagePreviewUrls } from '@/web/core/dataset/api/file';

export type ImagePreviewTokenItemType = {
  key?: string;
  url?: string;
  previewUrl?: string;
  name?: string;
};

const getDirectPreviewUrl = (image: ImagePreviewTokenItemType) => {
  const url = image.previewUrl || image.url || '';
  return url && !isDatasetFileObjectKey(url) ? url : '';
};

const getImageCacheKey = (image: ImagePreviewTokenItemType, index: number) =>
  image.key || image.url || image.previewUrl || `${index}`;

const ImagePreview = React.memo(function ImagePreview({
  image,
  datasetId,
  cachedPreviewUrl,
  onPreviewUrlChange
}: {
  image: ImagePreviewTokenItemType;
  datasetId?: string;
  cachedPreviewUrl?: string;
  onPreviewUrlChange?: (previewUrl: string) => void;
}) {
  const { t } = useSafeTranslation();
  const [previewUrl, setPreviewUrl] = useState(
    () => getDirectPreviewUrl(image) || cachedPreviewUrl
  );
  const [loadFailed, setLoadFailed] = useState(false);
  const [hasRefreshed, setHasRefreshed] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    setPreviewUrl(getDirectPreviewUrl(image) || cachedPreviewUrl || '');
    setLoadFailed(false);
    setHasRefreshed(false);
    setIsRefreshing(false);
  }, [cachedPreviewUrl, image]);

  useEffect(() => {
    if (!image.key || !datasetId || hasRefreshed || (previewUrl && !loadFailed)) return;

    let canceled = false;
    setHasRefreshed(true);
    setIsRefreshing(true);

    postGetSearchTestImagePreviewUrls({
      datasetId,
      keys: [image.key]
    })
      .then((res) => {
        const nextPreviewUrl = res.find((item) => item.key === image.key)?.previewUrl;
        if (!canceled && nextPreviewUrl) {
          setPreviewUrl(nextPreviewUrl);
          onPreviewUrlChange?.(nextPreviewUrl);
          setLoadFailed(false);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!canceled) {
          setIsRefreshing(false);
        }
      });

    return () => {
      canceled = true;
    };
  }, [datasetId, hasRefreshed, image.key, loadFailed, onPreviewUrlChange, previewUrl]);

  if (previewUrl && !loadFailed) {
    return (
      <Box
        as={'img'}
        src={previewUrl}
        alt={image.name || ''}
        w={'80px'}
        h={'80px'}
        objectFit={'cover'}
        borderRadius={'sm'}
        onError={() => setLoadFailed(true)}
      />
    );
  }

  if (image.key && datasetId && (!hasRefreshed || isRefreshing)) {
    return (
      <Flex
        w={'80px'}
        h={'80px'}
        alignItems={'center'}
        justifyContent={'center'}
        bg={'myGray.50'}
        border={'1px dashed'}
        borderColor={'myGray.300'}
        borderRadius={'sm'}
      >
        <CircularProgress isIndeterminate size={'24px'} color={'primary.600'} />
      </Flex>
    );
  }

  return (
    <Flex
      w={'80px'}
      h={'80px'}
      flexDir={'column'}
      alignItems={'center'}
      justifyContent={'center'}
      gap={1}
      bg={'myGray.50'}
      border={'1px dashed'}
      borderColor={'myGray.300'}
      borderRadius={'sm'}
      color={'myGray.500'}
      fontSize={'xs'}
      lineHeight={'16px'}
    >
      <MyIcon name={'image'} w={'20px'} h={'20px'} color={'myGray.400'} />
      <Box>{t('common:core.dataset.test.image_expired')}</Box>
    </Flex>
  );
});

const defaultTokenStyles: BoxProps = {
  as: 'span',
  display: 'inline-flex',
  px: 2,
  py: 1,
  border: '1px solid',
  borderColor: 'myGray.200',
  borderRadius: 'md',
  bg: 'white',
  color: 'myGray.700',
  cursor: 'pointer',
  lineHeight: '16px',
  verticalAlign: 'baseline'
};

const ImagePreviewToken = React.memo(function ImagePreviewToken({
  images,
  datasetId,
  containerProps,
  tokenProps
}: {
  images: ImagePreviewTokenItemType[];
  datasetId?: string;
  containerProps?: FlexProps;
  tokenProps?: BoxProps;
}) {
  const { t } = useSafeTranslation();
  const [hoveredImage, setHoveredImage] = useState<
    | {
        image: ImagePreviewTokenItemType;
        cacheKey: string;
        top: number;
        left: number;
      }
    | undefined
  >();
  const [previewUrlMap, setPreviewUrlMap] = useState<Record<string, string>>({});
  const [viewerImage, setViewerImage] = useState<
    | {
        cacheKey: string;
        src: string;
      }
    | undefined
  >();

  const updatePreviewUrl = useCallback((cacheKey: string, previewUrl: string) => {
    setPreviewUrlMap((state) => ({
      ...state,
      [cacheKey]: previewUrl
    }));
  }, []);

  const resolvePreviewUrl = useCallback(
    async (image: ImagePreviewTokenItemType, index: number) => {
      const directPreviewUrl = getDirectPreviewUrl(image);
      if (directPreviewUrl) return directPreviewUrl;

      const cacheKey = getImageCacheKey(image, index);
      const cachedPreviewUrl = previewUrlMap[cacheKey];
      if (cachedPreviewUrl) return cachedPreviewUrl;
      if (!image.key || !datasetId) return '';

      const previewUrl = await postGetSearchTestImagePreviewUrls({
        datasetId,
        keys: [image.key]
      })
        .then((previewUrls) => previewUrls.find((item) => item.key === image.key)?.previewUrl || '')
        .catch(() => '');

      if (previewUrl) {
        updatePreviewUrl(cacheKey, previewUrl);
      }

      return previewUrl;
    },
    [datasetId, previewUrlMap, updatePreviewUrl]
  );

  if (images.length === 0) return null;

  return (
    <>
      <Flex flexWrap={'wrap'} gap={2} {...containerProps}>
        {images.map((image, index) => (
          <Box
            key={`${getImageCacheKey(image, index)}`}
            {...defaultTokenStyles}
            {...tokenProps}
            role={'button'}
            tabIndex={0}
            title={t('common:Click_to_expand')}
            onMouseEnter={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setHoveredImage({
                image,
                cacheKey: getImageCacheKey(image, index),
                top: rect.bottom + 8,
                left: rect.left
              });
            }}
            onMouseLeave={() => setHoveredImage(undefined)}
            onClick={async (e) => {
              e.stopPropagation();
              const previewUrl = await resolvePreviewUrl(image, index);
              if (!previewUrl) return;

              setViewerImage({
                cacheKey: getImageCacheKey(image, index),
                src: previewUrl
              });
            }}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' && e.key !== ' ') return;
              e.preventDefault();
              e.currentTarget.click();
            }}
          >
            {t('common:core.dataset.test.image_token')}
          </Box>
        ))}
      </Flex>

      {!!hoveredImage && (
        <Portal>
          <Flex
            position={'fixed'}
            zIndex={'tooltip'}
            top={`${hoveredImage.top}px`}
            left={`${hoveredImage.left}px`}
            p={3}
            bg={'white'}
            borderWidth={'1px'}
            borderColor={'borderColor.base'}
            borderRadius={'md'}
            boxShadow={'2'}
            pointerEvents={'none'}
          >
            <ImagePreview
              image={hoveredImage.image}
              datasetId={datasetId}
              cachedPreviewUrl={previewUrlMap[hoveredImage.cacheKey]}
              onPreviewUrlChange={(previewUrl) =>
                updatePreviewUrl(hoveredImage.cacheKey, previewUrl)
              }
            />
          </Flex>
        </Portal>
      )}

      <MyPhotoSlider
        src={viewerImage?.src}
        visible={!!viewerImage}
        onClose={() => setViewerImage(undefined)}
        imageKey={viewerImage?.cacheKey}
      />
    </>
  );
});

export default ImagePreviewToken;
