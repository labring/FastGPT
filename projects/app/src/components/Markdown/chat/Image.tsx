import { Box, Flex } from '@chakra-ui/react';
import MdImage from '../img/Image';
import { useMemo } from 'react';

const ImageBlock = ({ images }: { images: string }) => {
  const formatData = useMemo(
    () =>
      images.split('\n').map((item) => {
        try {
          return JSON.parse(item) as { src: string };
        } catch (error) {
          return { src: '' };
        }
      }),
    [images]
  );

  return (
    <Flex alignItems={'center'} wrap={'wrap'}>
      {formatData.map(({ src }) => {
        return (
          <Box key={src} mr={2} mb={2} rounded={'md'} flex={'0 0 auto'} w={'120px'} maxH={'150px'}>
            <MdImage src={src} />
          </Box>
        );
      })}
    </Flex>
  );
};

export default ImageBlock;
