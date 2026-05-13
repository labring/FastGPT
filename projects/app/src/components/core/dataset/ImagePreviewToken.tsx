import React, { useEffect, useState } from 'react';
import { Box, Flex, Portal, type BoxProps, type FlexProps } from '@chakra-ui/react';
import { isDatasetFileObjectKey } from '@fastgpt/global/core/dataset/utils';
import MyIcon from '@fastgpt/web/components/common/Icon';
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

const ImagePreview = React.memo(function ImagePreview({
  image,
  datasetId
}: {
  image: ImagePreviewTokenItemType;
  datasetId?: string;
}) {
  const { t } = useSafeTranslation();
  const [previewUrl, setPreviewUrl] = useState(() => getDirectPreviewUrl(image));
  const [loadFailed, setLoadFailed] = useState(false);
  const [hasRefreshed, setHasRefreshed] = useState(false);

  useEffect(() => {
    setPreviewUrl(getDirectPreviewUrl(image));
    setLoadFailed(false);
    setHasRefreshed(false);
  }, [image]);

  useEffect(() => {
    if (!image.key || !datasetId || hasRefreshed || (previewUrl && !loadFailed)) return;

    let canceled = false;
    setHasRefreshed(true);

    postGetSearchTestImagePreviewUrls({
      datasetId,
      keys: [image.key]
    })
      .then((res) => {
        const nextPreviewUrl = res.find((item) => item.key === image.key)?.previewUrl;
        if (!canceled && nextPreviewUrl) {
          setPreviewUrl(nextPreviewUrl);
          setLoadFailed(false);
        }
      })
      .catch(() => {});

    return () => {
      canceled = true;
    };
  }, [datasetId, hasRefreshed, image.key, loadFailed, previewUrl]);

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
  cursor: 'default',
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
        top: number;
        left: number;
      }
    | undefined
  >();

  if (images.length === 0) return null;

  return (
    <>
      <Flex flexWrap={'wrap'} gap={2} {...containerProps}>
        {images.map((image, index) => (
          <Box
            key={`${image.key || image.url || image.previewUrl || index}`}
            {...defaultTokenStyles}
            {...tokenProps}
            onMouseEnter={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setHoveredImage({
                image,
                top: rect.bottom + 8,
                left: rect.left
              });
            }}
            onMouseLeave={() => setHoveredImage(undefined)}
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
            <ImagePreview image={hoveredImage.image} datasetId={datasetId} />
          </Flex>
        </Portal>
      )}
    </>
  );
});

export default ImagePreviewToken;
