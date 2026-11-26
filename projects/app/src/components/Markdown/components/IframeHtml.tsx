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

const htmlPreviewFrameOptions = {
  sandbox: 'allow-popups allow-scripts',
  referrerPolicy: 'no-referrer',
  style: {
    display: 'block',
    width: '100%',
    height: '100%',
    border: 'none',
    background: 'white'
  }
} as const;

const HtmlPreviewIframe = ({ code }: { code: string }) => (
  <iframe srcDoc={code} {...htmlPreviewFrameOptions} />
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
      bg={'myGray.150'}
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
        bg={'white'}
        borderRadius={'full'}
        boxShadow={'1'}
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
        color={!isPreview ? 'myGray.900' : 'myGray.500'}
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
        color={isPreview ? 'myGray.900' : 'myGray.500'}
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
  const [isCopied, setIsCopied] = useState(false);
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

  // 新标签页仅承载预览容器，HTML 始终在与内嵌预览同样隔离的 iframe 中运行。
  const handleOpenInNewTab = useCallback(() => {
    try {
      const previewDocument = document.implementation.createHTMLDocument(t('common:Preview'));
      const iframe = previewDocument.createElement('iframe');
      iframe.setAttribute('sandbox', htmlPreviewFrameOptions.sandbox);
      iframe.setAttribute('referrerpolicy', htmlPreviewFrameOptions.referrerPolicy);
      iframe.title = previewDocument.title;
      iframe.srcdoc = code;
      Object.assign(iframe.style, htmlPreviewFrameOptions.style, { position: 'fixed', inset: '0' });
      previewDocument.body.append(iframe);

      const blob = new Blob(['<!doctype html>', previewDocument.documentElement.outerHTML], {
        type: 'text/html;charset=utf-8'
      });
      const url = URL.createObjectURL(blob);
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 10000);
      const newWin = window.open(url, '_blank', 'noopener,noreferrer');
      if (newWin) {
        newWin.opener = null;
      }
    } catch (err) {
      console.error('Failed to open in new tab:', err);
    }
  }, [code, t]);

  if (!codeBlock) {
    return <code className={className}>{children}</code>;
  }

  return (
    <Box
      ref={Ref}
      className={`${styles.htmlCodeBlock} code-block-wrapper`}
      w="100%"
      my={3}
      bg={'white'}
      borderRadius={'md'}
      overflow={'hidden'}
      boxShadow={'1.5'}
    >
      {/* 顶部 Header：与浅色代码块视觉保持统一 */}
      <Flex
        className="code-header"
        h={'40px'}
        px={4}
        bg={'myGray.50'}
        color={'myGray.900'}
        userSelect={'none'}
        position="relative"
        zIndex={2}
        alignItems="center"
        fontSize={'xs'}
        gap={2}
      >
        {/* 左侧：语言标签与复制图标 */}
        <HStack flex={1} spacing={2} minW={0} overflow={'hidden'}>
          <Icon name={'code'} w={'14px'} h={'14px'} color={'myGray.900'} flexShrink={0} />
          <Text fontWeight={500} fontSize={'xs'} color={'myGray.900'} isTruncated>
            {codeBoxName}
          </Text>
          <MyTooltip
            label={isCopied ? t('common:copied') : t('common:copy_code')}
            placement="bottom"
            offset={[0, 10]}
            shouldWrapChildren={false}
            closeOnClick={false}
            onClose={() => setIsCopied(false)}
          >
            <IconButton
              icon={<Icon name={isCopied ? 'check' : 'copy'} w={'14px'} h={'14px'} />}
              size={'xsSquare'}
              variant={'grayGhost'}
              onClick={() => {
                copyData(code, null);
                setIsCopied(true);
              }}
              aria-label={isCopied ? t('common:copied') : t('common:copy_code')}
            />
          </MyTooltip>
        </HStack>

        {/* 右侧：开关形态的滑动分段切换器 */}
        <ViewModeToggleSwitch viewMode={viewMode} onChange={selectViewMode} isMobile={isMobile} />

        {/* 直接在新标签页打开按钮，取代全屏模态 */}
        <MyTooltip
          label={t('common:open_in_new_tab')}
          placement="bottom"
          offset={[0, 10]}
          shouldWrapChildren={false}
        >
          <IconButton
            icon={<Icon name={'export'} w={'14px'} h={'14px'} />}
            size={'xsSquare'}
            variant={'grayGhost'}
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
        <Box overflowX={'auto'} bg={'white'}>
          <SyntaxHighlighter
            style={codeLight as any}
            language={match?.[1]}
            PreTag={SourcePreTag}
            customStyle={{
              margin: 0,
              padding: '14px 16px',
              borderBottomLeftRadius: '8px',
              borderBottomRightRadius: '8px',
              background: '#ffffff'
            }}
          >
            {code.replace(/&nbsp;/g, ' ')}
          </SyntaxHighlighter>
        </Box>
      )}
    </Box>
  );
};

export default React.memo(IframeHtmlCodeBlock);
