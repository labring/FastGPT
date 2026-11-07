import React, { useContext, useState, useMemo } from 'react';
import { Box, Spinner, Text, HStack, Button, Link } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useMarkdownWidth } from '../utils/hooks';
import { MarkdownRendererRuntimeContext } from '../utils/runtimeContext';
import { isSafeHref } from '@fastgpt/global/common/string/url';

type VideoBlockProps = {
  code?: string;
  src?: string;
  poster?: string;
  controls?: boolean;
  children?: React.ReactNode;
} & React.VideoHTMLAttributes<HTMLVideoElement>;

type VideoSourceItem = {
  src: string;
  label?: string;
};

/**
 * 提取并规范化多媒体源（支持代码块多行链接、单个 src 属性以及 <source> 子标签）
 */
const extractVideoSources = (
  src?: string,
  code?: string,
  children?: React.ReactNode
): VideoSourceItem[] => {
  const sources: VideoSourceItem[] = [];
  const visited = new Set<string>();

  const add = (url: string, label?: string) => {
    const trimmed = url.trim();
    if (trimmed && isSafeHref(trimmed) && !visited.has(trimmed)) {
      visited.add(trimmed);
      sources.push({ src: trimmed, label });
    }
  };

  if (src) add(src);

  if (code) {
    const urls = code.split(/[\r\n]+/).map((u) => u.trim());
    urls.forEach((u) => add(u));
  }

  React.Children.forEach(children, (child) => {
    if (React.isValidElement(child)) {
      const childProps = child.props as any;
      if (childProps?.src) {
        add(childProps.src, childProps.label || childProps.type);
      }
    }
  });

  return sources;
};

/**
 * 画廊式受控多媒体视频播放组件：
 * 1. 支持多视频源自动识别与画廊 Tab 切换；
 * 2. 流式阶段轻量骨架屏占位，结束后一次性激活；
 * 3. 错误降级与安全协议限制。
 */
const VideoBlock = ({
  code,
  src,
  poster,
  controls = true,
  children,
  ...props
}: VideoBlockProps) => {
  const { t } = useTranslation();
  const { width, Ref } = useMarkdownWidth();
  const { showAnimation } = useContext(MarkdownRendererRuntimeContext);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isError, setIsError] = useState(false);

  const sources = useMemo(() => extractVideoSources(src, code, children), [src, code, children]);
  const currentSource = sources[currentIndex]?.src;
  const safePoster = poster && isSafeHref(poster) ? poster : undefined;

  // 流式打字阶段延迟加载真实媒体，展示轻量骨架占位
  if (showAnimation) {
    return (
      <Box w={width} ref={Ref} my={3} mx={'auto'} borderRadius={'md'} overflow={'hidden'}>
        <Box
          h={'140px'}
          bg={'myGray.100'}
          borderRadius={'md'}
          display={'flex'}
          alignItems={'center'}
          justifyContent={'center'}
        >
          <HStack spacing={2} color={'myGray.500'}>
            <Spinner size={'xs'} color={'primary.500'} />
            <Text fontSize={'xs'}>{t('common:video_preparing')}</Text>
          </HStack>
        </Box>
      </Box>
    );
  }

  if (isError || sources.length === 0) {
    return (
      <Box
        w={width}
        ref={Ref}
        my={3}
        mx={'auto'}
        p={3}
        borderRadius={'md'}
        bg={'myGray.100'}
        color={'myGray.600'}
        fontSize={'xs'}
      >
        <Text mb={1}>{t('common:video_cannot_play')}</Text>
        {src && (
          <Link
            href={isSafeHref(src) ? src : '#'}
            color={'primary.600'}
            isExternal
            textDecoration={'underline'}
          >
            {src}
          </Link>
        )}
      </Box>
    );
  }

  return (
    <Box
      w={width}
      ref={Ref}
      my={3}
      mx={'auto'}
      borderRadius={'md'}
      overflow={'hidden'}
      maxW={'100%'}
      border={'1px solid'}
      borderColor={'myGray.200'}
      bg={'black'}
    >
      {/* 多源画廊切换栏 */}
      {sources.length > 1 && (
        <HStack
          spacing={1.5}
          p={2}
          bg={'myGray.800'}
          overflowX={'auto'}
          borderBottom={'1px solid'}
          borderColor={'myGray.700'}
        >
          {sources.map((item, idx) => (
            <Button
              key={idx}
              size={'xs'}
              variant={currentIndex === idx ? 'solid' : 'ghost'}
              colorScheme={currentIndex === idx ? 'primary' : 'gray'}
              color={currentIndex === idx ? 'white' : 'myGray.300'}
              _hover={{ bg: currentIndex === idx ? undefined : 'myGray.700' }}
              onClick={() => {
                setIsError(false);
                setCurrentIndex(idx);
              }}
            >
              {item.label || t('common:source_label', { index: idx + 1 })}
            </Button>
          ))}
        </HStack>
      )}

      {/* 原生流式媒体播放器 */}
      <video
        key={currentSource}
        src={currentSource}
        poster={safePoster}
        controls={controls}
        preload={'metadata'}
        onError={() => setIsError(true)}
        style={{
          width: '100%',
          maxHeight: '520px',
          display: 'block',
          backgroundColor: '#000'
        }}
        {...props}
      />
    </Box>
  );
};

export default React.memo(VideoBlock);
