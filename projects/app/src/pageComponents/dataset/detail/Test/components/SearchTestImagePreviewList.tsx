import React from 'react';
import { Box, CircularProgress, Flex } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { searchTestImageThumbProps } from '../constants';
import type { SearchTestImageRef } from '../type';

type SearchTestImagePreviewListItem =
  | (SearchTestImageRef & {
      type: 'image';
    })
  | {
      type: 'uploading';
      key: string;
    };

// Render persisted previews and upload placeholders in the same grid to avoid layout jumps.
const SearchTestImagePreviewList = ({
  images,
  uploadingCount,
  onRemove
}: {
  images: SearchTestImageRef[];
  uploadingCount: number;
  onRemove: (key: string) => void;
}) => {
  if (images.length === 0 && uploadingCount === 0) return null;

  return (
    <Flex mb={3} gap={2} flexWrap={'wrap'}>
      {images.map((image) => (
        <SearchTestImagePreviewItem
          key={image.key}
          item={{ type: 'image', ...image }}
          onRemove={onRemove}
        />
      ))}
      {Array.from({ length: uploadingCount }).map((_, index) => (
        <SearchTestImagePreviewItem key={index} item={{ type: 'uploading', key: `${index}` }} />
      ))}
    </Flex>
  );
};

export default React.memo(SearchTestImagePreviewList);

const SearchTestImagePreviewItem = React.memo(function SearchTestImagePreviewItem({
  item,
  onRemove
}: {
  item: SearchTestImagePreviewListItem;
  onRemove?: (key: string) => void;
}) {
  return (
    <Flex position={'relative'} overflow={'visible'} {...searchTestImageThumbProps}>
      {item.type === 'image' ? (
        <>
          <Box
            as={'img'}
            src={item.previewUrl}
            alt=""
            w={'100%'}
            h={'100%'}
            objectFit={'cover'}
            borderRadius={'6.66667px'}
          />
          <Box
            position={'absolute'}
            right={'-7.5px'}
            top={'-7.5px'}
            w={'16.67px'}
            h={'16.67px'}
            display={'flex'}
            alignItems={'center'}
            justifyContent={'center'}
            bg={'myGray.400'}
            borderRadius={'50%'}
            boxShadow={
              '0px 6.66667px 6.66667px rgba(19, 51, 107, 0.1), 0px 0px 1.66667px rgba(19, 51, 107, 0.08)'
            }
            cursor={'pointer'}
            onClick={() => onRemove?.(item.key)}
          >
            <MyIcon name={'common/closeLight'} w={'11.9px'} h={'11.9px'} color={'white'} />
          </Box>
        </>
      ) : (
        <CircularProgress
          value={28}
          size={'46.67px'}
          thickness={'8px'}
          color={'primary.600'}
          trackColor={'myGray.250'}
          capIsRound
        />
      )}
    </Flex>
  );
});
