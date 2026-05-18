import ImagePreviewToken from '@/components/core/dataset/ImagePreviewToken';
import type { ImagePreviewTokenItemType } from '@/components/core/dataset/ImagePreviewToken';
import { Box } from '@chakra-ui/react';
import React from 'react';

const httpUrlReg = /^https?:\/\//i;

/**
 * nodeResponse 里为了兼容历史展示，把文本 query 和图片 URL 都放在 datasetQueries。
 * UI 侧只负责展示拆分：普通 http(s) URL 作为图片 token，其余内容按原文本换行展示。
 */
const splitDatasetQueries = (datasetQueries: string[]) => {
  const textQueries: string[] = [];
  const queryImages: ImagePreviewTokenItemType[] = [];

  for (const query of datasetQueries) {
    if (!query) continue;

    if (httpUrlReg.test(query)) {
      queryImages.push({ url: query });
    } else {
      textQueries.push(query);
    }
  }

  return {
    query: textQueries.join('\n'),
    queryImages
  };
};

const ImageQuery = ({
  datasetQueries,
  datasetId
}: {
  datasetQueries: string[];
  datasetId?: string;
}) => {
  const { query, queryImages } = splitDatasetQueries(datasetQueries);

  return (
    <Box
      border={'1px solid'}
      borderColor={'myGray.200'}
      borderRadius={'6px'}
      bg={'myGray.50'}
      color={'myGray.900'}
      minH={'32px'}
      px={3}
      py={2}
    >
      {!!query && (
        <Box whiteSpace={'pre-wrap'} mb={queryImages.length > 0 ? 2 : 0}>
          {query}
        </Box>
      )}
      <ImagePreviewToken images={queryImages} datasetId={datasetId} />
    </Box>
  );
};

export default ImageQuery;
