import React, { memo, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { Box, Flex } from '@chakra-ui/react';
import { useCopyData } from '@/utils/tools';
import Icon from '@/components/Iconfont';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

import 'katex/dist/katex.min.css';
import styles from './index.module.scss';
import { codeLight } from './codeLight';

const Markdown = ({ source, isChatting = false }: { source: string; isChatting?: boolean }) => {
  const formatSource = useMemo(() => source, [source]);
  const { copyData } = useCopyData();

  return (
    <ReactMarkdown
      className={`${styles.markdown} ${
        isChatting ? (source === '' ? styles.waitingAnimation : styles.animation) : ''
      }`}
      remarkPlugins={[remarkMath]}
      rehypePlugins={[remarkGfm, rehypeKatex]}
      components={{
        pre: 'div',
        code({ node, inline, className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '');
          const code = String(children);

          return !inline || match ? (
            <Box my={3} borderRadius={'md'} overflow={'hidden'} backgroundColor={'#222'}>
              <Flex
                py={2}
                px={5}
                backgroundColor={'#323641'}
                color={'#fff'}
                fontSize={'sm'}
                userSelect={'none'}
              >
                <Box flex={1}>{match?.[1]}</Box>
                <Flex cursor={'pointer'} onClick={() => copyData(code)} alignItems={'center'}>
                  <Icon name={'icon-fuzhi'} width={15} height={15} color={'#fff'}></Icon>
                  <Box ml={1}>复制代码</Box>
                </Flex>
              </Flex>
              <SyntaxHighlighter
                style={codeLight as any}
                language={match?.[1]}
                PreTag="pre"
                {...props}
              >
                {code}
              </SyntaxHighlighter>
            </Box>
          ) : (
            <code className={className} {...props}>
              {code}
            </code>
          );
        }
      }}
      linkTarget="_blank"
    >
      {formatSource}
    </ReactMarkdown>
  );
};

export default memo(Markdown);
