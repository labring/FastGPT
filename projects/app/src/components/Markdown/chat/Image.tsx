import { Box, Flex, Grid } from '@chakra-ui/react';
import MdImage from '../img/Image';
import { useMemo } from 'react';

const ImageBlock = ({ images }: { images: string }) => {
  const formatData = useMemo(
    () =>
      images
        .split('\n')
        .filter((item) => item)
        .map((item) => {
          try {
            return JSON.parse(item) as { src: string };
          } catch (error) {
            return { src: '' };
          }
        }),
    [images]
  );

  return (
    <Grid gridTemplateColumns={['1fr', '1fr 1fr']} gap={4}>
      {formatData.map(({ src }) => {
        return (
          <Box key={src} rounded={'md'} flex={'1 0 0'} minW={'120px'}>
            <MdImage src={src} />
          </Box>
        );
      })}
    </Grid>
  );
};

export default ImageBlock;
