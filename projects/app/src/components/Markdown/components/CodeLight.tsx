import React, { useMemo, useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { Box, Flex, HStack, IconButton } from '@chakra-ui/react';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import Icon from '@fastgpt/web/components/common/Icon';
import { useCopyData } from '@fastgpt/web/hooks/useCopyData';
import { useTranslation } from 'next-i18next';

export const codeLight: { [key: string]: React.CSSProperties } = {
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
    margin: '0',
    overflow: 'auto',
    background: '#171923'
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
    background: '#171923'
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

/**
 * 语言名称格式化（首字母大写规范）
 */
const formatLanguageName = (lang?: string): string => {
  if (!lang) return '';
  const lower = lang.toLowerCase();
  const specialMap: Record<string, string> = {
    js: 'JavaScript',
    javascript: 'JavaScript',
    ts: 'TypeScript',
    typescript: 'TypeScript',
    jsx: 'JSX',
    tsx: 'TSX',
    html: 'HTML',
    htm: 'HTML',
    css: 'CSS',
    json: 'JSON',
    md: 'Markdown',
    markdown: 'Markdown',
    sql: 'SQL',
    py: 'Python',
    python: 'Python',
    go: 'Go',
    rust: 'Rust',
    rs: 'Rust',
    sh: 'Shell',
    bash: 'Bash',
    zsh: 'Zsh'
  };
  return specialMap[lower] || lang.charAt(0).toUpperCase() + lang.slice(1);
};

const CodeLight = ({
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
  const [isWrap, setIsWrap] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  if (codeBlock) {
    const rawLanguage = match?.[1] || '';
    const codeBoxName = useMemo(() => {
      const input = match?.['input'] || '';
      if (!input) return formatLanguageName(rawLanguage);

      const splitInput = input.split('#');
      return splitInput[1] || formatLanguageName(rawLanguage);
    }, [match, rawLanguage]);

    const codeString = useMemo(() => String(children).replace(/&nbsp;/g, ' '), [children]);

    const handleCopy = () => {
      copyData(codeString);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    };

    return (
      <Box
        className="code-block-wrapper"
        my={3}
        position={'relative'}
        borderRadius={'md'}
        boxShadow={
          '0px 0px 1px 0px rgba(19, 51, 107, 0.08), 0px 1px 2px 0px rgba(19, 51, 107, 0.05)'
        }
      >
        {/* 吸顶头部：滚动时若代码块仍在可视区内，自动吸附在视口顶部 */}
        <Flex
          className="code-header"
          position={'sticky'}
          top={0}
          zIndex={2}
          py={2}
          px={4}
          bg={'#2d323b'}
          color={'white'}
          fontSize={'sm'}
          userSelect={'none'}
          alignItems={'center'}
          borderTopRadius={'md'}
          borderBottom={'1px solid'}
          borderColor={'rgba(255, 255, 255, 0.08)'}
        >
          {/* 左侧：代码图标与语言名称 */}
          <Flex
            flex={1}
            alignItems={'center'}
            fontWeight={500}
            fontSize={'xs'}
            color={'myGray.200'}
          >
            <Icon name={'code'} width={'14px'} height={'14px'} mr={2} color={'myGray.300'} />
            <Box>{codeBoxName}</Box>
          </Flex>

          {/* 右侧：自动换行切换与复制代码操作图标 */}
          <HStack spacing={1}>
            <MyTooltip
              label={isWrap ? t('common:disable_word_wrap') : t('common:enable_word_wrap')}
              placement="top"
              hasArrow
            >
              <IconButton
                icon={
                  <Icon
                    name={isWrap ? 'common/wrapText' : 'common/noWrapText'}
                    width={'14px'}
                    height={'14px'}
                  />
                }
                size={'xs'}
                variant={'ghost'}
                color={'rgba(255, 255, 255, 0.75)'}
                _hover={{
                  color: 'white',
                  bg: 'rgba(255, 255, 255, 0.15)'
                }}
                onClick={() => setIsWrap(!isWrap)}
                aria-label={isWrap ? t('common:disable_word_wrap') : t('common:enable_word_wrap')}
              />
            </MyTooltip>

            <MyTooltip
              label={isCopied ? t('common:copied') : t('common:Copy')}
              placement="top"
              hasArrow
            >
              <IconButton
                icon={<Icon name={'copy'} width={'14px'} height={'14px'} />}
                size={'xs'}
                variant={'ghost'}
                color={'rgba(255, 255, 255, 0.75)'}
                _hover={{
                  color: 'white',
                  bg: 'rgba(255, 255, 255, 0.15)'
                }}
                onClick={handleCopy}
                aria-label={t('common:Copy')}
              />
            </MyTooltip>
          </HStack>
        </Flex>

        {/* 代码内容区域，根据 isWrap 动态切换自动折行与横向滚动 */}
        <Box borderBottomRadius={'md'} overflowX={isWrap ? 'hidden' : 'auto'} bg={'#171923'}>
          <SyntaxHighlighter
            style={codeLight as any}
            language={rawLanguage}
            PreTag="pre"
            wrapLongLines={isWrap}
            customStyle={{
              margin: 0,
              padding: '14px 16px',
              borderBottomLeftRadius: '6px',
              borderBottomRightRadius: '6px',
              whiteSpace: isWrap ? 'pre-wrap' : 'pre',
              wordBreak: isWrap ? 'break-all' : 'normal',
              overflowX: isWrap ? 'hidden' : 'auto'
            }}
            codeTagProps={{
              style: {
                whiteSpace: isWrap ? 'pre-wrap' : 'pre',
                wordBreak: isWrap ? 'break-all' : 'normal'
              }
            }}
          >
            {codeString}
          </SyntaxHighlighter>
        </Box>
      </Box>
    );
  }

  return <code className={className}>{children}</code>;
};

export default React.memo(CodeLight);
