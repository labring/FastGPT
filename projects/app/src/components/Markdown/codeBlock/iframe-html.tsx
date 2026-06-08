import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import {
  Box,
  Flex,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalBody,
  ModalHeader,
  useDisclosure,
  ModalCloseButton
} from '@chakra-ui/react';
import Icon from '@fastgpt/web/components/common/Icon';
import { useCopyData } from '@fastgpt/web/hooks/useCopyData';
import { useTranslation } from 'next-i18next';
import { useMarkdownWidth } from '../hooks';
import type { IconNameType } from '@fastgpt/web/components/common/Icon/type';
import { codeLight } from './CodeLight';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import styles from '../index.module.scss';

const PANEL_HEIGHT = '60vh';

const StyledButton = ({
  label,
  iconName,
  onClick,
  isActive,
  viewMode,
  isMobile
}: {
  label: string;
  iconName: IconNameType;
  onClick: () => void;
  isActive?: boolean;
  viewMode: 'source' | 'iframe';
  isMobile?: boolean;
}) => {
  const isPreview = viewMode === 'iframe';

  const textColor = isPreview
    ? isActive
      ? 'myGray.900'
      : 'myGray.500'
    : isActive
      ? '#FFF'
      : 'rgba(255, 255, 255, 0.8)';
  const bg = isPreview ? (isActive ? 'myGray.150' : '') : isActive ? '#333A47' : '';
  const hoverBg = isPreview ? 'myGray.150' : '#333A47';

  return (
    <Flex
      bg={bg}
      color={textColor}
      borderRadius="5px"
      boxShadow="none"
      fontWeight={isActive ? 500 : 400}
      _hover={{
        bg: hoverBg
      }}
      alignItems="center"
      justifyContent="center"
      onClick={onClick}
      cursor="pointer"
      px={isMobile ? '6px' : '8px'}
      h={isMobile ? '24px' : '28px'}
    >
      {isMobile ? (
        <MyTooltip label={label} placement="bottom" hasArrow>
          <Flex alignItems="center" justifyContent="center">
            <Icon name={iconName} width="14px" height="14px" />
          </Flex>
        </MyTooltip>
      ) : (
        <Flex alignItems="center" justifyContent="flex-start">
          <Icon name={iconName} width="14px" height="14px" />
          <Box ml={2} fontSize="sm">
            {label}
          </Box>
        </Flex>
      )}
    </Flex>
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
  const streamFinished = !showAnimation;
  const htmlLooksNearlyDone = /<\/(?:body|html)\s*>/i.test(code);
  // 已完成的聊天 HTML 块直接展示结果；流式中的 HTML 块先留在源码视图。
  const shouldAutoPreviewOnMount = !!autoPreviewHtmlCodeBlock && isHtmlBlock && streamFinished;
  // 流式阶段避免每个 token 都重新跑语法高亮，保持代码增长和滚动都更轻。
  const showPlainStreamingCode = !!autoPreviewHtmlCodeBlock && isHtmlBlock && showAnimation;
  const [viewMode, setViewMode] = useState<'source' | 'iframe'>(
    shouldAutoPreviewOnMount ? 'iframe' : 'source'
  );
  const [userOverride, setUserOverride] = useState(false);
  // 自动切换只执行一次；用户主动点过 Tab 后不再覆盖他的选择。
  const autoSwitchedRef = useRef(shouldAutoPreviewOnMount);
  const prevShowAnimationRef = useRef(showAnimation);
  const streamingCodeRef = useRef<HTMLElement | null>(null);
  const isPreview = viewMode === 'iframe';

  const { isOpen, onOpen, onClose } = useDisclosure();

  const { width, Ref } = useMarkdownWidth();
  const isMobile = width <= 420;

  const codeBoxName = useMemo(() => {
    const input = match?.['input'] || '';
    if (!input) return match?.[1]?.toUpperCase();

    const splitInput = input.split('#');
    return splitInput[1] || match?.[1]?.toUpperCase();
  }, [match]);

  const Iframe = useMemo(
    () => (
      <iframe
        srcDoc={code}
        sandbox="allow-popups"
        referrerPolicy="no-referrer"
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          background: 'white'
        }}
      />
    ),
    [code]
  );

  const handleSelectViewMode = (mode: 'source' | 'iframe') => {
    // Code/Preview 是用户明确选择，后续流式完成不应再强制跳 Tab。
    setUserOverride(true);
    setViewMode(mode);
  };

  useEffect(() => {
    const wasStreaming = prevShowAnimationRef.current;
    prevShowAnimationRef.current = showAnimation;

    if (!autoPreviewHtmlCodeBlock) return;
    if (!isHtmlBlock) return;
    if (!showAnimation) return;
    if (wasStreaming) return;

    // 新一轮 HTML 流式开始时回到 Code，让用户看到源码持续写入。
    autoSwitchedRef.current = false;
    setUserOverride(false);
    setViewMode('source');
  }, [autoPreviewHtmlCodeBlock, isHtmlBlock, showAnimation]);

  useEffect(() => {
    if (!autoPreviewHtmlCodeBlock) return;
    if (!isHtmlBlock) return;
    if (!streamFinished && !htmlLooksNearlyDone) return;
    if (userOverride) return;
    if (autoSwitchedRef.current) return;

    // HTML 主体接近完成时就自动预览；没有明显结束标签时仍等流式结束兜底。
    autoSwitchedRef.current = true;
    setViewMode('iframe');
  }, [
    autoPreviewHtmlCodeBlock,
    code,
    htmlLooksNearlyDone,
    isHtmlBlock,
    streamFinished,
    userOverride
  ]);

  useEffect(() => {
    if (!showPlainStreamingCode) return;
    if (isPreview) return;

    const node = streamingCodeRef.current;
    if (!node) return;

    // 源码面板有固定高度，流式写入时需要跟随到底部才能看到最新代码。
    node.scrollTop = node.scrollHeight;
  }, [code, isPreview, showPlainStreamingCode]);

  if (codeBlock) {
    return (
      <Box
        ref={Ref}
        className={styles.htmlCodeBlock}
        my={3}
        borderRadius={'md'}
        overflow={'hidden'}
        boxShadow={
          '0px 1px 2px 0px rgba(19, 51, 107, 0.05), 0px 0px 1px 0px rgba(19, 51, 107, 0.08)'
        }
      >
        <Flex
          py={2}
          px={4}
          color={'white'}
          userSelect={'none'}
          position="relative"
          zIndex={2}
          alignItems="center"
          fontSize={'sm'}
          gap={1.5}
          {...(isPreview
            ? {
                borderBottom: '1px solid',
                borderColor: 'gray.150',
                bg: 'myGray.25'
              }
            : {
                bg: 'myGray.800'
              })}
        >
          <Box
            flex={1}
            display="flex"
            alignItems="center"
            color={isPreview ? 'myGray.800' : 'rgba(255, 255, 255, 0.9)'}
          >
            {codeBoxName}
            <Flex cursor="pointer" onClick={() => copyData(code)} alignItems="center" ml={2}>
              <Icon name="copy" width="14px" />
            </Flex>
          </Box>
          <StyledButton
            label={t('common:Code')}
            iconName="code"
            onClick={() => handleSelectViewMode('source')}
            isActive={viewMode === 'source'}
            viewMode={viewMode}
            isMobile={isMobile}
          />
          <StyledButton
            label={t('common:Preview')}
            iconName="preview"
            onClick={() => handleSelectViewMode('iframe')}
            isActive={viewMode === 'iframe'}
            viewMode={viewMode}
            isMobile={isMobile}
          />
          <StyledButton
            label={t('common:FullScreen')}
            iconName="fullScreen"
            onClick={onOpen}
            viewMode={viewMode}
            isMobile={isMobile}
          />
        </Flex>
        {isPreview ? (
          <Box w={width} h={PANEL_HEIGHT} maxH={PANEL_HEIGHT} overflow="auto">
            {Iframe}
          </Box>
        ) : showPlainStreamingCode ? (
          <Box
            as="pre"
            ref={(node: HTMLPreElement | null) => {
              streamingCodeRef.current = node;
            }}
            m={0}
            p="1em"
            h={PANEL_HEIGHT}
            maxH={PANEL_HEIGHT}
            overflow="auto"
            bg="#1e1e1e"
            color="#d4d4d4"
            fontSize="1em"
            lineHeight="1.5"
            whiteSpace="pre"
            fontFamily="monospace"
          >
            {code.replace(/&nbsp;/g, ' ')}
          </Box>
        ) : (
          <SyntaxHighlighter
            style={codeLight as any}
            language={match?.[1]}
            PreTag="pre"
            customStyle={{
              margin: 0,
              height: PANEL_HEIGHT,
              maxHeight: PANEL_HEIGHT,
              overflow: 'auto'
            }}
          >
            {code.replace(/&nbsp;/g, ' ')}
          </SyntaxHighlighter>
        )}

        {isOpen && (
          <Modal onClose={onClose} isOpen size={'full'}>
            <ModalOverlay />
            <ModalContent h={'100vh'} display={'flex'} flexDirection={'column'}>
              <ModalHeader
                display="flex"
                justifyContent="space-between"
                alignItems="center"
                p={4}
                bg="white"
                borderBottom="1px solid"
                borderColor="gray.300"
                height="60px"
              >
                <Box fontSize="lg" color="myGray.900">
                  {t('common:FullScreenLight')}
                </Box>
                <ModalCloseButton zIndex={1} position={'relative'} top={0} right={0} />
              </ModalHeader>

              <ModalBody p={0} flex="1">
                {Iframe}
              </ModalBody>
            </ModalContent>
          </Modal>
        )}
      </Box>
    );
  }

  return <code className={className}>{children}</code>;
};

export default React.memo(IframeHtmlCodeBlock);
