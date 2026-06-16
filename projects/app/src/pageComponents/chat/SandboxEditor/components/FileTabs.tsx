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
  mtime?: number;
};

type Props = {
  openedFiles: OpenedFile[];
  activeFilePath: string;
  setActiveFilePath: (path: string) => void;
  closeFile: (path: string, e?: React.MouseEvent) => void;
};

const FileTabs = ({ openedFiles, activeFilePath, setActiveFilePath, closeFile }: Props) => {
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const canScrollX = el.scrollWidth > el.clientWidth;
    if (!canScrollX) return;

    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (delta === 0) return;

    e.preventDefault();
    el.scrollLeft += delta;
  };

  return (
    <Box
      flexShrink={0}
      bg="transparent"
      h="40px"
      py="4px"
      px="4px"
      w="100%"
      overflowY="hidden"
      onWheel={handleWheel}
      flexWrap="nowrap"
      css={`
        /* overlay 是 Chromium/WebKit 的 legacy 值；先写标准回退，再用 overlay 保持滚动条不占位。 */
        overflow-x: auto;
        overflow-x: overlay;
        scrollbar-width: thin;
        scrollbar-color: rgba(148, 163, 184, 0.6) transparent;

        &::-webkit-scrollbar {
          height: 2px;
        }

        &::-webkit-scrollbar-thumb {
          background: rgba(148, 163, 184, 0.6);
          border-radius: 999px;
        }

        &::-webkit-scrollbar-track {
          background: transparent;
        }
      `}
    >
      <Flex h="full" gap="8px" alignItems={'center'}>
        {openedFiles.map((file) => {
          const active = activeFilePath === file.path;
          return (
            <Flex
              key={file.path}
              title={file.path}
              px={3}
              bg={active ? 'white' : 'transparent'}
              borderColor={'myGray.200'}
              align="center"
              gap="4px"
              fontSize="12px"
              cursor="pointer"
              onClick={() => setActiveFilePath(file.path)}
              maxW="160px"
              flexShrink={0}
              position="relative"
              h="32px"
              borderRadius="4px"
              boxShadow={
                active
                  ? '0px 0px 1px rgba(19, 51, 107, 0.15), 0px 1px 2px rgba(19, 51, 107, 0.1)'
                  : 'none'
              }
              _hover={{
                bg: active ? 'white' : 'rgba(17, 24, 36, 0.05)'
              }}
              userSelect={'none'}
            >
              <MyIcon
                name={getIconByFilename(file.name)}
                fill="none"
                w="16px"
                h="16px"
                color={active ? 'primary.700' : 'myGray.500'}
              />

              <Text
                flex={1}
                noOfLines={1}
                fontWeight="medium"
                color={active ? 'primary.700' : 'myGray.500'}
              >
                {file.name}
              </Text>
              <MyIcon
                name="common/closeLight"
                w="16px"
                h="16px"
                color="myGray.400"
                p="3px"
                _hover={{
                  color: 'myGray.700',
                  bg: 'myGray.100',
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
