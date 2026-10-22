import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { Box, Flex, HStack, Text, IconButton } from '@chakra-ui/react';
import Icon from '@fastgpt/web/components/common/Icon';
import { useCopyData } from '@fastgpt/web/hooks/useCopyData';
import { useTranslation } from 'next-i18next';
import { useMarkdownWidth } from '../utils/hooks';
import { codeLight } from './CodeLight';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import styles from '../index.module.scss';

type HtmlCodeBlockViewMode = 'source' | 'iframe';

/**
 * 管理 HTML 代码块的 Code/Preview 视图状态。
 */
const useHtmlCodeBlockViewMode = ({
  shouldAutoPreview,
  showAnimation
}: {
  shouldAutoPreview: boolean;
  showAnimation?: boolean;
}) => {
  const [viewMode, setViewMode] = useState<HtmlCodeBlockViewMode>(() =>
    shouldAutoPreview && !showAnimation ? 'iframe' : 'source'
  );
  const hasUserSelectedViewRef = useRef(false);

  useEffect(() => {
    if (!shouldAutoPreview) return;
    if (hasUserSelectedViewRef.current) return;

    setViewMode(showAnimation ? 'source' : 'iframe');
  }, [shouldAutoPreview, showAnimation]);

  const selectViewMode = (mode: HtmlCodeBlockViewMode) => {
    hasUserSelectedViewRef.current = true;
    setViewMode(mode);
  };

  return {
    viewMode,
    selectViewMode
  };
};

const HtmlPreviewIframe = ({ code }: { code: string }) => (
  <iframe
    srcDoc={code}
    sandbox="allow-popups allow-scripts"
    referrerPolicy="no-referrer"
    style={{
      display: 'block',
      width: '100%',
      height: '100%',
      border: 'none',
      background: 'white'
    }}
  />
);

/**
 * 左右滑动切换开关组件 (Sliding Switch / Segmented Toggle)
 * 具备指示器左右滑动的物理过渡动画，消除独立按键的生硬感
 */
const ViewModeToggleSwitch = ({
  viewMode,
  onChange,
  isMobile
}: {
  viewMode: HtmlCodeBlockViewMode;
  onChange: (mode: HtmlCodeBlockViewMode) => void;
  isMobile?: boolean;
}) => {
  const { t } = useTranslation();
  const isPreview = viewMode === 'iframe';

  return (
    <Box
      position={'relative'}
      display={'inline-flex'}
      alignItems={'center'}
      bg={'rgba(0, 0, 0, 0.28)'}
      borderRadius={'full'}
      p={'2px'}
      userSelect={'none'}
    >
      {/* 左右滑动的指示器滑块 */}
      <Box
        position={'absolute'}
        top={'2px'}
        bottom={'2px'}
        left={!isPreview ? '2px' : 'calc(50% + 1px)'}
        w={'calc(50% - 3px)'}
        bg={'rgba(255, 255, 255, 0.22)'}
        borderRadius={'full'}
        boxShadow={'0 1px 3px rgba(0, 0, 0, 0.25)'}
        transition={'left 0.2s cubic-bezier(0.4, 0, 0.2, 1)'}
        pointerEvents={'none'}
      />

      {/* 左侧：源码选项 */}
      <Flex
        alignItems={'center'}
        justifyContent={'center'}
        gap={1.5}
        px={isMobile ? '8px' : '10px'}
        h={'24px'}
        borderRadius={'full'}
        cursor={'pointer'}
        position={'relative'}
        zIndex={1}
        color={!isPreview ? 'white' : 'rgba(255, 255, 255, 0.65)'}
        fontWeight={!isPreview ? 500 : 400}
        fontSize={'xs'}
        transition={'color 0.2s'}
        onClick={() => onChange('source')}
      >
        <Icon name={'code'} width={'12px'} height={'12px'} />
        {!isMobile && <Text fontSize={'xs'}>{t('common:Code')}</Text>}
      </Flex>

      {/* 右侧：预览选项 */}
      <Flex
        alignItems={'center'}
        justifyContent={'center'}
        gap={1.5}
        px={isMobile ? '8px' : '10px'}
        h={'24px'}
        borderRadius={'full'}
        cursor={'pointer'}
        position={'relative'}
        zIndex={1}
        color={isPreview ? 'white' : 'rgba(255, 255, 255, 0.65)'}
        fontWeight={isPreview ? 500 : 400}
        fontSize={'xs'}
        transition={'color 0.2s'}
        onClick={() => onChange('iframe')}
      >
        <Icon name={'preview'} width={'12px'} height={'12px'} />
        {!isMobile && <Text fontSize={'xs'}>{t('common:Preview')}</Text>}
      </Flex>
    </Box>
  );
};

const IframeHtmlCodeBlock = ({
  children,
  className,
  codeBlock,
  match,
  showAnimation,
  autoPreviewHtmlCodeBlock
}: {
  children: React.ReactNode & React.ReactNode[];
  className?: string;
  codeBlock?: boolean;
  match: RegExpExecArray | null;
  showAnimation?: boolean;
  autoPreviewHtmlCodeBlock?: boolean;
}) => {
  const { t } = useTranslation();
  const { copyData } = useCopyData();
  const code = String(children);
  const lang = match?.[1]?.toLowerCase();
  const isHtmlBlock = lang === 'html' || lang === 'htm';
  const shouldAutoPreview = !!autoPreviewHtmlCodeBlock && isHtmlBlock;
  const showStreamingSourceCode = !!autoPreviewHtmlCodeBlock && isHtmlBlock && showAnimation;
  const { viewMode, selectViewMode } = useHtmlCodeBlockViewMode({
    shouldAutoPreview,
    showAnimation
  });
  const streamingCodeRef = useRef<HTMLPreElement | null>(null);
  const isPreview = viewMode === 'iframe';

  const { width, Ref } = useMarkdownWidth();
  const isMobile = width <= 420;

  const SourcePreTag = useMemo(
    () =>
      function SourcePreTag(props: React.HTMLAttributes<HTMLPreElement>) {
        return (
          <pre
            {...props}
            ref={(node) => {
              if (showStreamingSourceCode) {
                streamingCodeRef.current = node;
              }
            }}
          />
        );
      },
    [showStreamingSourceCode]
  );

  const codeBoxName = useMemo(() => {
    const input = match?.['input'] || '';
    if (!input) return match?.[1]?.toUpperCase();

    const splitInput = input.split('#');
    return splitInput[1] || match?.[1]?.toUpperCase();
  }, [match]);

  useEffect(() => {
    if (!showStreamingSourceCode) return;
    if (isPreview) return;

    const node = streamingCodeRef.current;
    if (!node) return;

    node.scrollTop = node.scrollHeight;
  }, [code, isPreview, showStreamingSourceCode]);

  // 在独立新标签页中打开预览
  const handleOpenInNewTab = useCallback(() => {
    try {
      const blob = new Blob([code], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const newWin = window.open(url, '_blank', 'noopener,noreferrer');
      if (newWin) {
        newWin.opener = null;
      }
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 10000);
    } catch (err) {
      console.error('Failed to open in new tab:', err);
    }
  }, [code]);

  if (codeBlock) {
    return (
      <Box
        ref={Ref}
        className={`${styles.htmlCodeBlock} code-block-wrapper`}
        w="100%"
        my={3}
        borderRadius={'md'}
        overflow={'hidden'}
        boxShadow={
          '0px 1px 2px 0px rgba(19, 51, 107, 0.05), 0px 0px 1px 0px rgba(19, 51, 107, 0.08)'
        }
      >
        {/* 顶部 Header：恒定保持深蓝灰色 #2d323b */}
        <Flex
          className="code-header"
          h={'38px'}
          px={3}
          bg={'#2d323b'}
          color={'white'}
          userSelect={'none'}
          position="relative"
          zIndex={2}
          alignItems="center"
          fontSize={'xs'}
          gap={2}
          borderBottom={'1px solid'}
          borderColor={'rgba(255, 255, 255, 0.08)'}
        >
          {/* 左侧：语言标签与复制图标 */}
          <HStack flex={1} spacing={2} minW={0} overflow={'hidden'}>
            <Icon name={'code'} width={'14px'} height={'14px'} color={'rgba(255, 255, 255, 0.7)'} />
            <Text fontWeight={500} fontSize={'xs'} color={'rgba(255, 255, 255, 0.95)'} isTruncated>
              {codeBoxName}
            </Text>
            <MyTooltip label={t('common:Copy')} placement="top" hasArrow>
              <IconButton
                icon={<Icon name={'copy'} width={'13px'} height={'13px'} />}
                size={'xs'}
                variant={'ghost'}
                color={'rgba(255, 255, 255, 0.75)'}
                _hover={{
                  color: 'white',
                  bg: 'rgba(255, 255, 255, 0.15)'
                }}
                onClick={() => copyData(code)}
                aria-label={t('common:Copy')}
              />
            </MyTooltip>
          </HStack>

          {/* 右侧：开关形态的滑动分段切换器 */}
          <ViewModeToggleSwitch viewMode={viewMode} onChange={selectViewMode} isMobile={isMobile} />

          {/* 直接在新标签页打开按钮，取代全屏模态 */}
          <MyTooltip label={t('common:open_in_new_tab')} placement="top" hasArrow>
            <IconButton
              icon={<Icon name={'export'} width={'13px'} height={'13px'} />}
              size={'xs'}
              variant={'ghost'}
              color={'rgba(255, 255, 255, 0.75)'}
              _hover={{
                color: 'white',
                bg: 'rgba(255, 255, 255, 0.15)'
              }}
              onClick={handleOpenInNewTab}
              aria-label={t('common:open_in_new_tab')}
            />
          </MyTooltip>
        </Flex>

        {/* 内容展示区 */}
        {isPreview ? (
          <Box className="code-block-body" h={'60vh'} bg={'white'}>
            <HtmlPreviewIframe code={code} />
          </Box>
        ) : (
          <Box overflowX={'auto'} bg={'#171923'}>
            <SyntaxHighlighter
              style={codeLight as any}
              language={match?.[1]}
              PreTag={SourcePreTag}
              customStyle={{
                margin: 0,
                padding: '14px 16px',
                borderBottomLeftRadius: '6px',
                borderBottomRightRadius: '6px',
                background: '#171923'
              }}
            >
              {code.replace(/&nbsp;/g, ' ')}
            </SyntaxHighlighter>
          </Box>
        )}
      </Box>
    );
  }

  return <code className={className}>{children}</code>;
};

export default React.memo(IframeHtmlCodeBlock);
