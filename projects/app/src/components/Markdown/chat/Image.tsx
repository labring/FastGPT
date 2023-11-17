import { Box, Flex } from '@chakra-ui/react';
import MdImage from '../img/Image';

const ImageBlock = ({ images }: { images: string }) => {
  return (
    <Flex w={'100%'} wrap={'wrap'}>
      {JSON.parse(images).map((src: string) => {
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
