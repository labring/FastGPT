import React, { memo, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { formatLinkText } from '@/utils/tools';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

import 'katex/dist/katex.min.css';
import styles from './index.module.scss';
import CodeLight from './codeLight';
import Loading from './Loading';
import MermaidCodeBlock from './MermaidCodeBlock';
import MdImage from './Image';

const Markdown = ({
  source,
  isChatting = false,
  formatLink
}: {
  source: string;
  formatLink?: boolean;
  isChatting?: boolean;
}) => {
  const formatSource = useMemo(() => {
    return formatLink ? formatLinkText(source) : source;
  }, [source, formatLink]);

  return (
    <ReactMarkdown
      className={`markdown ${styles.markdown}
        ${isChatting ? (source === '' ? styles.waitingAnimation : styles.animation) : ''}
      `}
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        pre: 'div',
        img({ src = '' }) {
          return isChatting ? <Loading text="图片加载中..." /> : <MdImage src={src} />;
        },
        code({ node, inline, className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '');

          if (match?.[1] === 'mermaid') {
            return isChatting ? (
              <Loading text="导图加载中..." />
            ) : (
              <MermaidCodeBlock code={String(children)} />
            );
          }

          return (
            <CodeLight className={className} inline={inline} match={match} {...props}>
              {children}
            </CodeLight>
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
