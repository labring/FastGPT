import React, { useContext, useState, useMemo } from 'react';
import { Box, Spinner, Text, HStack, Button, Link } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { MarkdownRendererRuntimeContext } from '../utils/runtimeContext';
import { isSafeHref } from '@fastgpt/global/common/string/url';

type AudioBlockProps = {
  code?: string;
  src?: string;
  controls?: boolean;
  children?: React.ReactNode;
} & React.AudioHTMLAttributes<HTMLAudioElement>;

type AudioSourceItem = {
  src: string;
  label?: string;
};

/**
 * 提取并规范化多音频源
 */
const extractAudioSources = (
  src?: string,
  code?: string,
  children?: React.ReactNode
): AudioSourceItem[] => {
  const sources: AudioSourceItem[] = [];
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
 * 受控音频播放组件：
 * 1. 消除外层多余矩形边框与留白，保留原生胶囊控制条的纯净质感；
 * 2. 宽度限制在合理的 maxW(480px) 范围内，避免超长进度条被过度拉伸变形；
 * 3. 支持多音频源切换与流式延迟骨架占位。
 */
const AudioBlock = ({ code, src, controls = true, children, ...props }: AudioBlockProps) => {
  const { t } = useTranslation();
  const { showAnimation } = useContext(MarkdownRendererRuntimeContext);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isError, setIsError] = useState(false);

  const sources = useMemo(() => extractAudioSources(src, code, children), [src, code, children]);
  const currentSource = sources[currentIndex]?.src;

  // 流式打字阶段延迟加载真实媒体，展示轻量骨架占位
  if (showAnimation) {
    return (
      <Box my={2.5} maxW={'480px'} w={'100%'} mx={'auto'}>
        <Box
          h={'42px'}
          bg={'myGray.100'}
          borderRadius={'full'}
          display={'flex'}
          alignItems={'center'}
          justifyContent={'center'}
        >
          <HStack spacing={2} color={'myGray.500'}>
            <Spinner size={'xs'} color={'primary.500'} />
            <Text fontSize={'xs'}>{t('common:audio_preparing')}</Text>
          </HStack>
        </Box>
      </Box>
    );
  }

  if (isError || sources.length === 0) {
    return (
      <Box
        my={2.5}
        maxW={'480px'}
        w={'100%'}
        p={2.5}
        borderRadius={'md'}
        bg={'myGray.100'}
        color={'myGray.600'}
        fontSize={'xs'}
      >
        <Text mb={1}>{t('common:audio_cannot_play')}</Text>
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
    <Box my={2.5} maxW={'480px'} w={'100%'} mx={'auto'}>
      {/* 多源画廊切换栏 */}
      {sources.length > 1 && (
        <HStack spacing={1.5} mb={2} overflowX={'auto'}>
          {sources.map((item, idx) => (
            <Button
              key={idx}
              size={'xs'}
              variant={currentIndex === idx ? 'solid' : 'ghost'}
              colorScheme={currentIndex === idx ? 'primary' : 'gray'}
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

      {/* 原生胶囊控制条 */}
      <audio
        key={currentSource}
        src={currentSource}
        controls={controls}
        preload={'metadata'}
        onError={() => setIsError(true)}
        style={{
          width: '100%',
          height: '42px',
          display: 'block'
        }}
        {...props}
      />
    </Box>
  );
};

export default React.memo(AudioBlock);
