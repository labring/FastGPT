import { Box, Flex, Grid } from '@chakra-ui/react';
import MdImage from '@/components/Markdown/img/Image';
import { UserInputFileItemType } from '@/components/core/chat/ChatContainer/ChatBox/type';

const FilesBlock = ({ files }: { files: UserInputFileItemType[] }) => {
  return (
    <Grid gridTemplateColumns={['1fr', '1fr 1fr']} gap={4}>
      {files.map(({ id, type, name, url }, i) => {
        if (type === 'image') {
          return (
            <Box key={i} rounded={'md'} flex={'1 0 0'} minW={'120px'}>
              <MdImage src={url} />
            </Box>
          );
        }
        return null;
      })}
    </Grid>
  );
};

export default FilesBlock;
