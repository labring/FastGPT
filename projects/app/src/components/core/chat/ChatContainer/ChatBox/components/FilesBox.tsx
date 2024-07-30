import { Box, Flex, Grid, Text } from '@chakra-ui/react';
import MdImage from '@/components/Markdown/img/Image';
import { UserInputFileItemType } from '@/components/core/chat/ChatContainer/ChatBox/type';
import MyIcon from '@fastgpt/web/components/common/Icon';
import React, { useMemo } from 'react';
import { clone } from 'lodash';
import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';

const FilesBlock = ({ files }: { files: UserInputFileItemType[] }) => {
  // sort files, file->image
  const sortFiles = useMemo(() => {
    return clone(files).sort((a, b) => {
      if (a.type === ChatFileTypeEnum.image && b.type === ChatFileTypeEnum.file) {
        return 1;
      } else if (a.type === ChatFileTypeEnum.file && b.type === ChatFileTypeEnum.image) {
        return -1;
      }
      return 0;
    });
  }, [files]);

  return (
    <Grid
      gridTemplateColumns={['1fr', 'repeat(2, 1fr)', 'repeat(3, 1fr)']}
      gap={4}
      alignItems={'flex-start'}
    >
      {sortFiles.map(({ id, type, name, url, icon }, i) => (
        <Box key={i} bg={'white'} borderRadius={'md'} overflow="hidden">
          {type === 'image' && <MdImage src={url} minH={'100px'} my={0} />}
          {type === 'file' && (
            <Flex
              p={2}
              w={'100%'}
              alignItems="center"
              cursor={'pointer'}
              onClick={() => {
                window.open(url);
              }}
            >
              <MyIcon
                name={icon as any}
                flexShrink={0}
                w={['1.5rem', '2rem']}
                h={['1.5rem', '2rem']}
              />
              <Text
                ml={2}
                fontSize={'xs'}
                overflow="hidden"
                textOverflow="ellipsis"
                whiteSpace="nowrap"
              >
                {name || url}
              </Text>
            </Flex>
          )}
        </Box>
      ))}
    </Grid>
  );
};

export default React.memo(FilesBlock);
