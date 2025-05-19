import React from 'react';
import { Flex, Box } from '@chakra-ui/react';
import ImageDatasetContextProvider from '../Context';
import ImageDataset from './ImageDataset';

const ImageDatasetEntry = () => {
  return (
    <Flex
      flexDirection={'column'}
      bg={'white'}
      h={'100%'}
      px={[2, 9]}
      py={[2, 5]}
      borderRadius={'md'}
    >
      <ImageDatasetContextProvider>
        <Box flex={'1 0 0'} overflow={'auto'}>
          <ImageDataset />
        </Box>
      </ImageDatasetContextProvider>
    </Flex>
  );
};

export default React.memo(ImageDatasetEntry);
