import React, { useMemo, useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { Box, Flex, HStack, IconButton } from '@chakra-ui/react';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import Icon from '@fastgpt/web/components/common/Icon';
import { useCopyData } from '@fastgpt/web/hooks/useCopyData';
import { useTranslation } from 'next-i18next';

const CODE_FONT_FAMILY = 'Menlo, Monaco, Consolas, "Courier New", monospace';

export const codeLight: { [key: string]: React.CSSProperties } = {
  'code[class*=language-]': {
    color: '#24292e',
    fontFamily: CODE_FONT_FAMILY,
    fontSize: '14px',
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
    color: '#24292e',
    fontFamily: CODE_FONT_FAMILY,
    fontSize: '14px',
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
    padding: '14px 16px',
    margin: '0',
    overflow: 'auto',
    background: '#ffffff'
  },
  'code[class*=language-] ::selection': {
    textShadow: 'none',
    background: '#c8e1ff'
  },
  'code[class*=language-]::selection': {
    textShadow: 'none',
    background: '#c8e1ff'
  },
  'pre[class*=language-] ::selection': {
    textShadow: 'none',
    background: '#c8e1ff'
  },
  'pre[class*=language-]::selection': {
    textShadow: 'none',
    background: '#c8e1ff'
  },
  ':not(pre)>code[class*=language-]': {
    padding: '.1em .3em',
    borderRadius: '.3em',
    color: '#24292e',
    background: '#f4f6f8'
  },
  '.namespace': {
    opacity: '0.7'
  },
  'doctype.doctype-tag': {
    color: '#22863a'
  },
  'doctype.name': {
    color: '#22863a'
  },
  comment: {
    color: '#6a737d'
  },
  prolog: {
    color: '#6a737d'
  },
  '.language-html .language-css .token.punctuation': {
    color: '#24292e'
  },
  '.language-html .language-javascript .token.punctuation': {
    color: '#24292e'
  },
  punctuation: {
    color: '#24292e'
  },
  boolean: {
    color: '#005cc5'
  },
  constant: {
    color: '#005cc5'
  },
  inserted: {
    color: '#22863a'
  },
  number: {
    color: '#005cc5'
  },
  property: {
    color: '#005cc5'
  },
  'property-access': {
    color: '#005cc5'
  },
  symbol: {
    color: '#005cc5'
  },
  tag: {
    color: '#22863a'
  },
  unit: {
    color: '#005cc5'
  },
  'attr-name': {
    color: '#6f42c1'
  },
  builtin: {
    color: '#e36209'
  },
  char: {
    color: '#032f62'
  },
  deleted: {
    color: '#b31d28'
  },
  selector: {
    color: '#22863a'
  },
  string: {
    color: '#032f62'
  },
  '.language-css .token.string.url': {
    textDecoration: 'underline'
  },
  entity: {
    color: '#005cc5'
  },
  operator: {
    color: '#d73a49'
  },
  'operator.arrow': {
    color: '#d73a49'
  },
  atrule: {
    color: '#005cc5'
  },
  'atrule.rule': {
    color: '#d73a49'
  },
  'atrule.url': {
    color: '#032f62'
  },
  'atrule.url.function': {
    color: '#6f42c1'
  },
  'atrule.url.punctuation': {
    color: '#24292e'
  },
  keyword: {
    color: '#d73a49'
  },
  'keyword.control-flow': {
    color: '#d73a49'
  },
  'keyword.module': {
    color: '#d73a49'
  },
  function: {
    color: '#6f42c1'
  },
  'function.maybe-class-name': {
    color: '#6f42c1'
  },
  // Prism 为方法调用同时附加 method/function/property-access，避免被 property-access 覆写为蓝色。
  'function.property-access': {
    color: '#6f42c1'
  },
  'method.function': {
    color: '#6f42c1'
  },
  regex: {
    color: '#032f62'
  },
  important: {
    color: '#d73a49'
  },
  bold: {
    fontWeight: 'bold'
  },
  italic: {
    fontStyle: 'italic'
  },
  'class-name': {
    color: '#6f42c1'
  },
  'maybe-class-name': {
    color: '#6f42c1'
  },
  console: {
    color: '#005cc5'
  },
  parameter: {
    color: '#24292e'
  },
  interpolation: {
    color: '#24292e'
  },
  'punctuation.interpolation-punctuation': {
    color: '#d73a49'
  },
  'exports.maybe-class-name': {
    color: '#24292e'
  },
  'imports.maybe-class-name': {
    color: '#24292e'
  },
  variable: {
    color: '#005cc5'
  },
  escape: {
    color: '#e36209'
  },
  'tag.punctuation': {
    color: '#24292e'
  },
  cdata: {
    color: '#6a737d'
  },
  'attr-value': {
    color: '#032f62'
  },
  'attr-value.punctuation': {
    color: '#032f62'
  },
  'attr-value.punctuation.attr-equals': {
    color: '#24292e'
  },
  namespace: {
    color: '#6f42c1'
  },
  'code[class*=language-javascript]': {
    color: '#24292e'
  },
  'code[class*=language-jsx]': {
    color: '#24292e'
  },
  'code[class*=language-tsx]': {
    color: '#24292e'
  },
  'code[class*=language-typescript]': {
    color: '#24292e'
  },
  'pre[class*=language-javascript]': {
    color: '#24292e'
  },
  'pre[class*=language-jsx]': {
    color: '#24292e'
  },
  'pre[class*=language-tsx]': {
    color: '#24292e'
  },
  'pre[class*=language-typescript]': {
    color: '#24292e'
  },
  'code[class*=language-css]': {
    color: '#24292e'
  },
  'pre[class*=language-css]': {
    color: '#24292e'
  },
  'code[class*=language-html]': {
    color: '#24292e'
  },
  'pre[class*=language-html]': {
    color: '#24292e'
  },
  '.language-regex .token.anchor': {
    color: '#005cc5'
  },
  '.language-html .token.punctuation': {
    color: '#24292e'
  },
  'pre[class*=language-]>code[class*=language-]': {
    position: 'relative',
    zIndex: '1'
  },
  '.line-highlight.line-highlight': {
    background: '#fff8c5',
    boxShadow: 'inset 4px 0 0 #f7d87c',
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
  children?: React.ReactNode;
  className?: string;
  codeBlock?: boolean;
  match: RegExpExecArray | null;
}) => {
  const { t } = useTranslation();
  const { copyData } = useCopyData();
  const [isWrap, setIsWrap] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const rawLanguage = match?.[1] || '';
  const codeBoxName = useMemo(() => {
    const input = match?.['input'] || '';
    if (!input) return formatLanguageName(rawLanguage);

    const splitInput = input.split('#');
    return splitInput[1] || formatLanguageName(rawLanguage);
  }, [match, rawLanguage]);

  const codeString = useMemo(() => String(children).replace(/&nbsp;/g, ' '), [children]);

  if (!codeBlock) {
    return <code className={className}>{children}</code>;
  }

  const wrapLabel = isWrap ? t('common:disable_word_wrap') : t('common:enable_word_wrap');
  const copyLabel = isCopied ? t('common:copied') : t('common:copy_code');

  return (
    <Box
      className="code-block-wrapper"
      my={3}
      position={'relative'}
      bg={'white'}
      borderRadius={'md'}
      boxShadow={'1.5'}
    >
      {/* 吸顶头部：滚动时若代码块仍在可视区内，自动吸附在视口顶部 */}
      <Flex
        className="code-header"
        position={'sticky'}
        // 工具详情为其吸顶标题留位，普通 Markdown 默认仍贴合滚动区域顶部。
        top={'var(--code-header-top, 0px)'}
        zIndex={2}
        py={2}
        px={4}
        bg={'myGray.50'}
        color={'myGray.900'}
        fontSize={'sm'}
        userSelect={'none'}
        alignItems={'center'}
        borderTopRadius={'md'}
      >
        {/* 左侧：代码图标与语言名称 */}
        <Flex
          flex={1}
          minW={0}
          alignItems={'center'}
          fontWeight={500}
          fontSize={'xs'}
          color={'myGray.900'}
        >
          <Icon name={'code'} w={'14px'} h={'14px'} mr={2} color={'myGray.900'} flexShrink={0} />
          <Box isTruncated>{codeBoxName}</Box>
        </Flex>

        {/* 右侧：自动换行切换与复制代码操作图标 */}
        <HStack spacing={1} flexShrink={0}>
          <MyTooltip
            label={wrapLabel}
            placement="bottom"
            offset={[0, 10]}
            shouldWrapChildren={false}
          >
            <IconButton
              icon={
                <Icon
                  name={isWrap ? 'common/wrapText' : 'common/noWrapText'}
                  w={'14px'}
                  h={'14px'}
                />
              }
              size={'xsSquare'}
              variant={'grayGhost'}
              onClick={() => setIsWrap((prev) => !prev)}
              aria-label={wrapLabel}
            />
          </MyTooltip>

          <MyTooltip
            label={copyLabel}
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
                copyData(codeString, null);
                setIsCopied(true);
              }}
              aria-label={copyLabel}
            />
          </MyTooltip>
        </HStack>
      </Flex>

      {/* 代码内容区域，根据 isWrap 动态切换自动折行与横向滚动 */}
      <Box borderBottomRadius={'md'} overflowX={isWrap ? 'hidden' : 'auto'} bg={'white'}>
        <SyntaxHighlighter
          style={codeLight as any}
          language={rawLanguage}
          PreTag="pre"
          wrapLongLines={isWrap}
          customStyle={{
            margin: 0,
            padding: '14px 16px',
            borderBottomLeftRadius: '8px',
            borderBottomRightRadius: '8px',
            background: '#ffffff',
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
};

export default React.memo(CodeLight);
