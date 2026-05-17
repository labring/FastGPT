import ImagePreviewToken from '@/components/core/dataset/ImagePreviewToken';
import { Box } from '@chakra-ui/react';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import React from 'react';

const ImageQuery = ({
  query,
  queryImages,
  datasetId
}: {
  query?: string;
  queryImages: NonNullable<ChatHistoryItemResType['queryImages']>;
  datasetId?: string;
}) => {
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
