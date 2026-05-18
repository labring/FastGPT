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

type PreviewCache =
  | {
      status: 'ready';
      url: string;
    }
  | {
      status: 'expired';
    };

const getDirectPreviewUrl = (image: ImagePreviewTokenItemType) => {
  const url = image.previewUrl || image.url || '';
  return url && !isDatasetFileObjectKey(url) ? url : '';
};

const getImageCacheKey = (image: ImagePreviewTokenItemType, index: number) =>
  image.key || image.url || image.previewUrl || `${index}`;

const PREVIEW_URL_TIMEOUT_MS = 5000;

const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number) => {
  let timer: ReturnType<typeof setTimeout>;

  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Search test image preview timeout')), timeoutMs);
    })
  ]).finally(() => {
    clearTimeout(timer);
  });
};

const ImagePreview = React.memo(function ImagePreview({
  image,
  datasetId,
  cachedPreviewUrl,
  onPreviewUrlChange,
  onPreviewExpired
}: {
  image: ImagePreviewTokenItemType;
  datasetId?: string;
  cachedPreviewUrl?: string;
  onPreviewUrlChange?: (previewUrl: string) => void;
  onPreviewExpired?: () => void;
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

    withTimeout(
      postGetSearchTestImagePreviewUrls({
        datasetId,
        keys: [image.key]
      }),
      PREVIEW_URL_TIMEOUT_MS
    )
      .then((res) => {
        const nextPreviewUrl = res.find((item) => item.key === image.key)?.previewUrl;
        if (!canceled) {
          if (nextPreviewUrl) {
            setPreviewUrl(nextPreviewUrl);
            onPreviewUrlChange?.(nextPreviewUrl);
            setLoadFailed(false);
          } else {
            onPreviewExpired?.();
          }
        }
      })
      .catch(() => {
        if (!canceled) {
          onPreviewExpired?.();
        }
      })
      .finally(() => {
        if (!canceled) {
          setIsRefreshing(false);
        }
      });

    return () => {
      canceled = true;
    };
  }, [
    datasetId,
    hasRefreshed,
    image.key,
    loadFailed,
    onPreviewExpired,
    onPreviewUrlChange,
    previewUrl
  ]);

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
        onError={() => {
          setLoadFailed(true);
          if (!image.key || !datasetId || hasRefreshed) {
            onPreviewExpired?.();
          }
        }}
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
  const [previewCacheMap, setPreviewCacheMap] = useState<Record<string, PreviewCache>>({});
  const [viewerImage, setViewerImage] = useState<
    | {
        cacheKey: string;
        src: string;
      }
    | undefined
  >();

  const updatePreviewUrl = useCallback((cacheKey: string, previewUrl: string) => {
    setPreviewCacheMap((state) => ({
      ...state,
      [cacheKey]: {
        status: 'ready',
        url: previewUrl
      }
    }));
  }, []);

  const markPreviewExpired = useCallback((cacheKey: string) => {
    setPreviewCacheMap((state) => ({
      ...state,
      [cacheKey]: {
        status: 'expired'
      }
    }));
  }, []);

  const resolvePreviewUrl = useCallback(
    async (image: ImagePreviewTokenItemType, index: number) => {
      const cacheKey = getImageCacheKey(image, index);
      const previewCache = previewCacheMap[cacheKey];
      if (previewCache?.status === 'expired') return '';

      const directPreviewUrl = getDirectPreviewUrl(image);
      if (directPreviewUrl) return directPreviewUrl;

      if (previewCache?.status === 'ready') return previewCache.url;
      if (!image.key || !datasetId) return '';

      const previewUrl = await withTimeout(
        postGetSearchTestImagePreviewUrls({
          datasetId,
          keys: [image.key]
        }),
        PREVIEW_URL_TIMEOUT_MS
      )
        .then((previewUrls) => previewUrls.find((item) => item.key === image.key)?.previewUrl || '')
        .catch(() => '');

      if (previewUrl) {
        updatePreviewUrl(cacheKey, previewUrl);
      } else {
        markPreviewExpired(cacheKey);
      }

      return previewUrl;
    },
    [datasetId, markPreviewExpired, previewCacheMap, updatePreviewUrl]
  );

  if (images.length === 0) return null;

  const hoveredPreviewCache = hoveredImage ? previewCacheMap[hoveredImage.cacheKey] : undefined;
  const hoveredPreviewUrl =
    hoveredPreviewCache?.status === 'ready' ? hoveredPreviewCache.url : undefined;

  return (
    <>
      <Flex flexWrap={'wrap'} gap={2} {...containerProps}>
        {images.map((image, index) => {
          const cacheKey = getImageCacheKey(image, index);
          const isPreviewExpired = previewCacheMap[cacheKey]?.status === 'expired';

          return (
            <Box
              key={cacheKey}
              {...defaultTokenStyles}
              {...tokenProps}
              cursor={isPreviewExpired ? 'default' : 'pointer'}
              role={isPreviewExpired ? undefined : 'button'}
              tabIndex={isPreviewExpired ? undefined : 0}
              aria-label={
                isPreviewExpired
                  ? t('common:core.dataset.test.image_expired')
                  : t('common:Click_to_expand')
              }
              onMouseEnter={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setHoveredImage({
                  image,
                  cacheKey,
                  top: rect.bottom + 8,
                  left: rect.left
                });
              }}
              onMouseLeave={() => setHoveredImage(undefined)}
              onClick={async (e) => {
                e.stopPropagation();
                if (isPreviewExpired) return;

                const previewUrl = await resolvePreviewUrl(image, index);
                if (!previewUrl) return;

                setViewerImage({
                  cacheKey,
                  src: previewUrl
                });
              }}
              onKeyDown={(e) => {
                if (isPreviewExpired || (e.key !== 'Enter' && e.key !== ' ')) return;
                e.preventDefault();
                e.currentTarget.click();
              }}
            >
              {t('common:core.dataset.test.image_token')}
            </Box>
          );
        })}
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
              cachedPreviewUrl={hoveredPreviewUrl}
              onPreviewUrlChange={(previewUrl) =>
                updatePreviewUrl(hoveredImage.cacheKey, previewUrl)
              }
              onPreviewExpired={() => markPreviewExpired(hoveredImage.cacheKey)}
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
