import { Box, Flex, Grid, Text } from '@chakra-ui/react';
import MdImage from '@/components/Markdown/img/Image';
import { type UserInputFileItemType } from '@/components/core/chat/ChatContainer/ChatBox/type';
import MyIcon from '@fastgpt/web/components/common/Icon';
import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { clone } from 'lodash';
import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { useWidthVariable } from '@fastgpt/web/hooks/useWidthVariable';

const FilesBlock = ({
  files,
  singleColumn = false,
  imageVariant = 'default'
}: {
  files: UserInputFileItemType[];
  singleColumn?: boolean;
  imageVariant?: 'default' | 'chatBubble';
}) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(400);
  const { isPc } = useSystem();
  const responsiveGridColumns = useWidthVariable({
    width,
    widthList: [300, 500, 700],
    list: ['1fr', 'repeat(2, 1fr)', 'repeat(3, 1fr)']
  });
  const gridColumns = singleColumn ? '1fr' : responsiveGridColumns;

  // sort files, document/audio/video->image
  const sortFiles = useMemo(() => {
    return clone(files).sort((a, b) => {
      return Number(a.type === ChatFileTypeEnum.image) - Number(b.type === ChatFileTypeEnum.image);
    });
  }, [files]);

  const computedChatItemWidth = useCallback(() => {
    if (singleColumn) return;
    if (!chartRef.current) return;

    // 一直找到 parent = markdown 的元素
    let parent = chartRef.current?.parentElement;
    while (parent && !parent.className.includes('chat-box-card')) {
      parent = parent.parentElement;
    }

    const clientWidth = parent?.clientWidth ?? 400;
    setWidth(clientWidth);
    return parent;
  }, [isPc, singleColumn]);

  useLayoutEffect(() => {
    computedChatItemWidth();
  }, [computedChatItemWidth]);

  return (
    <Grid
      ref={chartRef}
      gridTemplateColumns={gridColumns}
      gap={2}
      alignItems={'flex-start'}
      justifyItems={singleColumn ? 'start' : undefined}
      w={singleColumn ? 'fit-content' : undefined}
      maxW={'100%'}
    >
      {sortFiles.map(({ id, type, name, url, icon }, i) => (
        <Box
          key={i}
          bg={'white'}
          borderRadius={imageVariant === 'chatBubble' ? 0 : 'md'}
          overflow="hidden"
          w={singleColumn ? 'fit-content' : undefined}
          maxW={'100%'}
        >
          {type === 'image' && (
            <MdImage
              src={url}
              minW={imageVariant === 'chatBubble' ? 'auto' : undefined}
              minH={imageVariant === 'chatBubble' ? 'auto' : '100px'}
              borderRadius={imageVariant === 'chatBubble' ? 0 : undefined}
              maxW={'100%'}
              my={0}
            />
          )}
          {type !== 'image' && (
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
