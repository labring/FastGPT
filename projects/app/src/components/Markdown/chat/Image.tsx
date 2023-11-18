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
    <Flex w={'100%'} wrap={'wrap'}>
      {formatData.map(({ src }) => {
        return (
          <Box key={src} mr={2} mb={2} rounded={'md'} flex={'0 0 auto'} w={'100px'} h={'100px'}>
            <MdImage src={src} />
          </Box>
        );
      })}
    </Flex>
  );
};

export default ImageBlock;
