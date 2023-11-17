import { Box, Flex } from '@chakra-ui/react';
import MdImage from '../img/Image';

const ImageBlock = ({ srcArray }: { srcArray: string }) => {
  const regex = /src:"([^"]+)"/g;
  const srcList = srcArray.split(`\n`).map((item) => {
    regex.lastIndex = 0;
    const matches = regex.exec(item);
    if (!matches) return;
    return matches[1];
  });
  srcList.pop();
  return (
    <Flex w={'100%'} wrap={'wrap'}>
      {srcList.map((src) => {
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
