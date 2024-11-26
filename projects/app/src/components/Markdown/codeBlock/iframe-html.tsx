import React, { useMemo, useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import {
  Box,
  Flex,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalBody,
  useDisclosure
} from '@chakra-ui/react';
import Icon from '@fastgpt/web/components/common/Icon';
import { useCopyData } from '@/web/common/hooks/useCopyData';
import { useTranslation } from 'next-i18next';

const iframeHtmlCodeBlock: { [key: string]: React.CSSProperties } = {
  'code[class*=language-]': {
    color: '#d4d4d4',
    textShadow: 'none',
    direction: 'ltr',
    textAlign: 'left',
    whiteSpace: 'pre',
    wordSpacing: 'normal',
    wordBreak: 'normal',
    lineHeight: '1.5',
    MozTabSize: '4',
    OTabSize: '4',
    tabSize: '4',
    WebkitHyphens: 'none',
    MozHyphens: 'none',
    msHyphens: 'none',
    hyphens: 'none'
  },
  'pre[class*=language-]': {
    color: '#d4d4d4',
    textShadow: 'none',
    direction: 'ltr',
    textAlign: 'left',
    whiteSpace: 'pre',
    wordSpacing: 'normal',
    wordBreak: 'normal',
    lineHeight: '1.5',
    MozTabSize: '4',
    OTabSize: '4',
    tabSize: '4',
    WebkitHyphens: 'none',
    MozHyphens: 'none',
    msHyphens: 'none',
    hyphens: 'none',
    padding: '1em',
    margin: '.5em 0',
    overflow: 'auto',
    background: '#1e1e1e'
  },
  'code[class*=language-] ::selection': {
    textShadow: 'none',
    background: '#264f78'
  },
  'code[class*=language-]::selection': {
    textShadow: 'none',
    background: '#264f78'
  },
  'pre[class*=language-] ::selection': {
    textShadow: 'none',
    background: '#264f78'
  },
  'pre[class*=language-]::selection': {
    textShadow: 'none',
    background: '#264f78'
  },
  ':not(pre)>code[class*=language-]': {
    padding: '.1em .3em',
    borderRadius: '.3em',
    color: '#db4c69',
    background: '#1e1e1e'
  },
  '.namespace': {
    opacity: '0.7'
  },
  'doctype.doctype-tag': {
    color: '#569cd6'
  },
  'doctype.name': {
    color: '#9cdcfe'
  },
  comment: {
    color: '#6a9955'
  },
  prolog: {
    color: '#6a9955'
  },
  '.language-html .language-css .token.punctuation': {
    color: '#d4d4d4'
  },
  '.language-html .language-javascript .token.punctuation': {
    color: '#d4d4d4'
  },
  punctuation: {
    color: '#d4d4d4'
  },
  boolean: {
    color: '#569cd6'
  },
  constant: {
    color: '#9cdcfe'
  },
  inserted: {
    color: '#b5cea8'
  },
  number: {
    color: '#b5cea8'
  },
  property: {
    color: '#9cdcfe'
  },
  symbol: {
    color: '#b5cea8'
  },
  tag: {
    color: '#569cd6'
  },
  unit: {
    color: '#b5cea8'
  },
  'attr-name': {
    color: '#9cdcfe'
  },
  builtin: {
    color: '#ce9178'
  },
  char: {
    color: '#ce9178'
  },
  deleted: {
    color: '#ce9178'
  },
  selector: {
    color: '#d7ba7d'
  },
  string: {
    color: '#ce9178'
  },
  '.language-css .token.string.url': {
    textDecoration: 'underline'
  },
  entity: {
    color: '#569cd6'
  },
  operator: {
    color: '#d4d4d4'
  },
  'operator.arrow': {
    color: '#569cd6'
  },
  atrule: {
    color: '#ce9178'
  },
  'atrule.rule': {
    color: '#c586c0'
  },
  'atrule.url': {
    color: '#9cdcfe'
  },
  'atrule.url.function': {
    color: '#dcdcaa'
  },
  'atrule.url.punctuation': {
    color: '#d4d4d4'
  },
  keyword: {
    color: '#569cd6'
  },
  'keyword.control-flow': {
    color: '#c586c0'
  },
  'keyword.module': {
    color: '#c586c0'
  },
  function: {
    color: '#dcdcaa'
  },
  'function.maybe-class-name': {
    color: '#dcdcaa'
  },
  regex: {
    color: '#d16969'
  },
  important: {
    color: '#569cd6'
  },
  italic: {
    fontStyle: 'italic'
  },
  'class-name': {
    color: '#4ec9b0'
  },
  'maybe-class-name': {
    color: '#4ec9b0'
  },
  console: {
    color: '#9cdcfe'
  },
  parameter: {
    color: '#9cdcfe'
  },
  interpolation: {
    color: '#9cdcfe'
  },
  'punctuation.interpolation-punctuation': {
    color: '#569cd6'
  },
  'exports.maybe-class-name': {
    color: '#9cdcfe'
  },
  'imports.maybe-class-name': {
    color: '#9cdcfe'
  },
  variable: {
    color: '#9cdcfe'
  },
  escape: {
    color: '#d7ba7d'
  },
  'tag.punctuation': {
    color: 'grey'
  },
  cdata: {
    color: 'grey'
  },
  'attr-value': {
    color: '#ce9178'
  },
  'attr-value.punctuation': {
    color: '#ce9178'
  },
  'attr-value.punctuation.attr-equals': {
    color: '#d4d4d4'
  },
  namespace: {
    color: '#4ec9b0'
  },
  'code[class*=language-javascript]': {
    color: '#9cdcfe'
  },
  'code[class*=language-jsx]': {
    color: '#9cdcfe'
  },
  'code[class*=language-tsx]': {
    color: '#9cdcfe'
  },
  'code[class*=language-typescript]': {
    color: '#9cdcfe'
  },
  'pre[class*=language-javascript]': {
    color: '#9cdcfe'
  },
  'pre[class*=language-jsx]': {
    color: '#9cdcfe'
  },
  'pre[class*=language-tsx]': {
    color: '#9cdcfe'
  },
  'pre[class*=language-typescript]': {
    color: '#9cdcfe'
  },
  'code[class*=language-css]': {
    color: '#ce9178'
  },
  'pre[class*=language-css]': {
    color: '#ce9178'
  },
  'code[class*=language-html]': {
    color: '#d4d4d4'
  },
  'pre[class*=language-html]': {
    color: '#d4d4d4'
  },
  '.language-regex .token.anchor': {
    color: '#dcdcaa'
  },
  '.language-html .token.punctuation': {
    color: 'grey'
  },
  'pre[class*=language-]>code[class*=language-]': {
    position: 'relative',
    zIndex: '1'
  },
  '.line-highlight.line-highlight': {
    background: '#f7ebc6',
    boxShadow: 'inset 5px 0 0 #f7d87c',
    zIndex: '0'
  }
};

const StyledButton = ({
  label,
  iconName,
  onClick,
  isActive,
  viewMode
}: {
  label: string;
  iconName: string;
  onClick: () => void;
  isActive?: boolean;
  viewMode: 'source' | 'iframe';
}) => (
  <Box
    as="button"
    bg={
      viewMode === 'iframe'
        ? isActive
          ? '#F0F1F6'
          : 'rgba(255, 255, 255, 0.9)'
        : isActive
          ? '#333A47'
          : '#232833'
    }
    color={viewMode === 'iframe' ? '#2C2C2E' : 'rgba(255, 255, 255, 0.8)'}
    fontFamily="PingFang SC"
    fontSize="14px"
    fontWeight="500"
    lineHeight="16px"
    letterSpacing="0.5px"
    px={4}
    py={2}
    borderRadius="5px"
    _hover={{
      bg:
        viewMode === 'iframe'
          ? isActive
            ? '#F0F1F6'
            : '#F7F7F7'
          : isActive
            ? '#444B55'
            : '#2C2F3A'
    }}
    display="flex"
    alignItems="center"
    justifyContent="center"
    onClick={onClick}
    ml={2}
  >
    <Icon name={iconName} width={'15px'} height={'15px'} />
    <Box ml={2} fontSize="sm">
      {label}
    </Box>
  </Box>
);

const IframeHtmlCodeBlock = ({
  children,
  className,
  codeBlock,
  match
}: {
  children: React.ReactNode & React.ReactNode[];
  className?: string;
  codeBlock?: boolean;
  match: RegExpExecArray | null;
}) => {
  const { t } = useTranslation();
  const { copyData } = useCopyData();
  const [viewMode, setViewMode] = useState<'source' | 'iframe'>('source');
  const { isOpen, onOpen, onClose } = useDisclosure();

  if (codeBlock) {
    const codeBoxName = useMemo(() => {
      const input = match?.['input'] || '';
      if (!input) return match?.[1].toUpperCase();

      const splitInput = input.split('#');
      return splitInput[1] || match?.[1].toUpperCase();
    }, [match]);

    return (
      <Box
        my={3}
        borderRadius={'md'}
        overflow={'overlay'}
        boxShadow={
          '0px 0px 1px 0px rgba(19, 51, 107, 0.08), 0px 1px 2px 0px rgba(19, 51, 107, 0.05)'
        }
      >
        <Flex
          className="code-header"
          py={1}
          px={4}
          bg={viewMode === 'iframe' ? 'rgba(255, 255, 255, 0.8)' : '#232833'}
          color={'white'}
          fontSize={'sm'}
          userSelect={'none'}
          gap="5px"
          alignItems="center"
        >
          <Box
            flex={1}
            display="flex"
            alignItems="center"
            color={viewMode === 'iframe' ? '#2C2C2E' : 'rgba(255, 255, 255, 0.9)'}
          >
            {codeBoxName}
            <Flex
              cursor="pointer"
              onClick={() => copyData(String(children))}
              alignItems="center"
              ml={2}
            >
              <Icon name="copy" width={15} height={15} />
            </Flex>
          </Box>
          <StyledButton
            label={t('common:common.SourceCode')}
            iconName="code"
            onClick={() => setViewMode('source')}
            isActive={viewMode === 'source'}
            viewMode={viewMode}
          />
          <StyledButton
            label={t('common:common.Preview')}
            iconName="preview"
            onClick={() => setViewMode('iframe')}
            isActive={viewMode === 'iframe'}
            viewMode={viewMode}
          />
          <StyledButton
            label={t('common:common.FullScreen')}
            iconName="fullScreen"
            onClick={onOpen}
            viewMode={viewMode}
          />
        </Flex>
        {viewMode === 'source' ? (
          <SyntaxHighlighter style={iframeHtmlCodeBlock as any} language={match?.[1]} PreTag="pre">
            {String(children).replace(/&nbsp;/g, ' ')}
          </SyntaxHighlighter>
        ) : (
          <Box w="100%" h="400px">
            <iframe
              srcDoc={String(children)}
              sandbox="allow-scripts allow-forms allow-popups allow-same-origin"
              style={{
                width: '100%',
                height: '100%',
                border: 'none'
              }}
            />
          </Box>
        )}
        <Modal isOpen={isOpen} onClose={onClose} size="full">
          <ModalOverlay />
          <ModalContent>
            <Flex
              alignItems="center"
              color="#white"
              px={5}
              py={2}
              fontFamily="PingFang SC"
              fontWeight="500"
              lineHeight="24px"
              letterSpacing="0.15px"
              bg="#white"
              userSelect="none"
              borderBottom="1px solid #E0E0E0"
              position="fixed"
              top="0"
              left="0"
              right="0"
              zIndex="1000"
              height="60px"
            >
              <Box flex={1} display="flex" alignItems="center">
                <Box px={4} py={1} color="#24282C" fontSize="18px" display="inline-block">
                  {t('common:common.FullScreenLight')}
                </Box>
              </Box>
              <Box onClick={onClose} cursor="pointer" fontSize="lg" color="white">
                <Icon name="common/closeLight" width="20px" height="20px" color="#24282C" />
              </Box>
            </Flex>

            <ModalBody p={0}>
              <iframe
                srcDoc={String(children)}
                sandbox="allow-scripts allow-forms allow-popups allow-same-origin"
                style={{
                  width: '100%',
                  height: '100vh',
                  border: 'none',
                  background: '#fff',
                  paddingTop: '60px',
                  overflowY: 'auto'
                }}
              />
            </ModalBody>
          </ModalContent>
        </Modal>
      </Box>
    );
  }

  return <code className={className}>{children}</code>;
};

export default React.memo(IframeHtmlCodeBlock);
