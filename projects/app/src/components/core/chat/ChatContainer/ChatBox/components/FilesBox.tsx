import { Box, Flex, Text } from '@chakra-ui/react';
import MdImage from '@/components/Markdown/img/Image';
import { type UserInputFileItemType } from '@/components/core/chat/ChatContainer/ChatBox/type';
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
    <Flex wrap={'wrap'} gap={2} alignItems={'flex-start'}>
      {sortFiles.map(({ id, type, name, url, icon }, i) => (
        <Box
          key={id || i}
          bg={'white'}
          borderRadius={'md'}
          overflow="hidden"
          w={type === 'image' ? '80px' : ['100%', '240px']}
          h={type === 'image' ? '80px' : undefined}
          flexShrink={type === 'image' ? 0 : undefined}
          alignSelf={type === 'image' ? 'stretch' : undefined}
          aspectRatio={type === 'image' ? 1 : undefined}
        >
          {type === 'image' && (
            <MdImage
              src={url}
              w={'80px'}
              h={'80px'}
              minW={'80px'}
              minH={'80px'}
              maxH={'80px'}
              bg={'lightgray'}
              objectFit={'cover'}
              my={0}
            />
          )}
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
    </Flex>
  );
};

export default React.memo(FilesBlock);
