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
      bg="white"
      h={'36px'}
      borderBottom={'1px solid'}
      borderColor={'myGray.200'}
      overflowX="auto"
      overflowY="hidden"
      flexWrap="nowrap"
      css={{
        '&::-webkit-scrollbar': {
          height: '2px'
        },
        '&::-webkit-scrollbar-thumb': {
          background: '#E2E8F0',
          borderRadius: '1px'
        },
        '&::-webkit-scrollbar-track': {
          background: 'transparent'
        }
      }}
    >
      <Flex h="full" gap={0} alignItems={'stretch'}>
        {openedFiles.map((file) => {
          const active = activeFilePath === file.path;
          return (
            <Flex
              key={file.path}
              title={file.path}
              px={4}
              bg={'white'}
              borderRight={'1px solid'}
              borderColor={'myGray.200'}
              align="center"
              gap={2}
              fontSize="12px"
              cursor="pointer"
              onClick={() => setActiveFilePath(file.path)}
              maxW="160px"
              flexShrink={0}
              position="relative"
              h="full"
              _hover={{
                bg: 'myGray.50'
              }}
              userSelect={'none'}
            >
              {active && (
                <Box
                  position={'absolute'}
                  top={0}
                  left={0}
                  right={0}
                  h={'2px'}
                  bg={'primary.600'}
                />
              )}
              <MyIcon
                name={getIconByFilename(file.name)}
                fill="none"
                w="16px"
                h="16px"
                color={active ? 'myGray.800' : 'myGray.500'}
              />

              <Text
                flex={1}
                noOfLines={1}
                fontWeight={active ? '500' : '400'}
                color={active ? 'myGray.900' : 'myGray.500'}
              >
                {file.name}
              </Text>
              <MyIcon
                name="common/closeLight"
                w="14px"
                color="myGray.400"
                p={'2px'}
                _hover={{
                  color: 'myGray.700',
                  bg: 'myGray.200',
                  borderRadius: 'sm'
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  closeFile(file.path, e);
                }}
              />
            </Flex>
          );
        })}
      </Flex>
    </Box>
  );
};

export default FileTabs;
