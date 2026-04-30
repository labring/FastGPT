import React from 'react';
import { Box, Flex, Text } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { getIconByFilename } from '../utils';

export type OpenedFile = {
  path: string;
  name: string;
  content: string;
  language: string;
  isBinary: boolean;
  isDirty: boolean;
  // 非媒体文件 UTF-8 解码失败时为 true，前端走「无法预览」兜底
  isUnknown?: boolean;
};

type Props = {
  openedFiles: OpenedFile[];
  activeFilePath: string;
  setActiveFilePath: (path: string) => void;
  closeFile: (path: string, e?: React.MouseEvent) => void;
};

const FileTabs = ({ openedFiles, activeFilePath, setActiveFilePath, closeFile }: Props) => {
  return (
    <Box
      flexShrink={0}
      p={1}
      bg="myGray.50"
      borderRadius="md"
      border="sm"
      m={3}
      mb={0}
      overflowX="auto"
      overflowY="hidden"
      flexWrap="nowrap"
      css={{
        '&::-webkit-scrollbar': {
          height: '6px'
        },
        '&::-webkit-scrollbar-thumb': {
          background: '#E2E8F0',
          borderRadius: '3px'
        },
        '&::-webkit-scrollbar-track': {
          background: 'transparent'
        }
      }}
    >
      <Flex gap={2} alignItems={'center'}>
        {openedFiles.map((file) => {
          const active = activeFilePath === file.path;
          return (
            <Flex
              key={file.path}
              px={3}
              py={1}
              h={'22px'}
              bg={active ? 'white' : 'myGray.25'}
              borderRadius="4px"
              align="center"
              gap={1}
              fontSize="12px"
              cursor="pointer"
              onClick={() => setActiveFilePath(file.path)}
              maxW="150px"
              flexShrink={0}
              position="relative"
              boxShadow={'1.5'}
              _hover={{
                bg: active ? 'white' : 'myGray.50'
              }}
            >
              <MyIcon name={getIconByFilename(file.name)} w="16px" color="myGray.600" />
              <Text
                flex={1}
                noOfLines={1}
                fontWeight={active ? '500' : '400'}
                color={active ? 'primary.700' : 'myGray.500'}
              >
                {file.name}
              </Text>
              {file.isDirty && <Box w="6px" h="6px" borderRadius="50%" bg="yellow.600" />}
              <MyIcon
                name="common/closeLight"
                w="16px"
                color="myGray.500"
                _hover={{
                  color: 'primary.500'
                }}
                onClick={(e) => closeFile(file.path, e)}
              />
            </Flex>
          );
        })}
      </Flex>
    </Box>
  );
};

export default FileTabs;
