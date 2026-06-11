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

type HtmlCodeBlockViewMode = 'source' | 'iframe';

/**
 * 管理 HTML 代码块的 Code/Preview 视图状态。
 *
 * 自动预览只服务聊天流式 HTML 输出：流式阶段保持源码，流式结束后切到预览；
 * 用户主动选择 Code/Preview 后，后续流式状态变化不再覆盖用户选择。
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
  viewMode: HtmlCodeBlockViewMode;
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

const HtmlPreviewIframe = ({ code }: { code: string }) => (
  <iframe
    srcDoc={code}
    sandbox="allow-popups"
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
  // 流式阶段仍展示源码高亮；只额外接管滚动，让最新输出保持可见。
  const showStreamingSourceCode = !!autoPreviewHtmlCodeBlock && isHtmlBlock && showAnimation;
  const { viewMode, selectViewMode } = useHtmlCodeBlockViewMode({
    shouldAutoPreview,
    showAnimation
  });
  const streamingCodeRef = useRef<HTMLPreElement | null>(null);
  const isPreview = viewMode === 'iframe';

  const { isOpen, onOpen, onClose } = useDisclosure();

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

    // 源码面板限制最大高度，流式写入时需要跟随到底部才能看到最新代码。
    node.scrollTop = node.scrollHeight;
  }, [code, isPreview, showStreamingSourceCode]);

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
        <Flex
          className="code-header"
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
            onClick={() => selectViewMode('source')}
            isActive={viewMode === 'source'}
            viewMode={viewMode}
            isMobile={isMobile}
          />
          <StyledButton
            label={t('common:Preview')}
            iconName="preview"
            onClick={() => selectViewMode('iframe')}
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
          <Box className="code-block-body" h={'60vh'}>
            <HtmlPreviewIframe code={code} />
          </Box>
        ) : (
          <SyntaxHighlighter
            style={codeLight as any}
            language={match?.[1]}
            PreTag={SourcePreTag}
            customStyle={{
              margin: 0
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
                <HtmlPreviewIframe code={code} />
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
