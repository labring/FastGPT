import React from 'react';
import ReactMarkdown from 'react-markdown';
import RemarkGfm from 'remark-gfm';
import RemarkMath from 'remark-math';
import RehypeKatex from 'rehype-katex';
import RemarkBreaks from 'remark-breaks';

import 'katex/dist/katex.min.css';
import styles from './index.module.scss';

import Link from './Link';
import CodeLight from './CodeLight';
import MermaidCodeBlock from './img/MermaidCodeBlock';
import MdImage from './img/Image';

function Code({ inline, className, children }: any) {
  const match = /language-(\w+)/.exec(className || '');

  if (match?.[1] === 'mermaid') {
    return <MermaidCodeBlock code={String(children)} />;
  }

  return (
    <CodeLight className={className} inline={inline} match={match}>
      {children}
    </CodeLight>
  );
}

function Image({ src }: { src?: string }) {
  return <MdImage src={src} />;
}

const Markdown = ({ source, isChatting = false }: { source: string; isChatting?: boolean }) => {
  return (
    <ReactMarkdown
      className={`markdown ${styles.markdown}
      ${isChatting ? (source === '' ? styles.waitingAnimation : styles.animation) : ''}
    `}
      remarkPlugins={[RemarkGfm, RemarkMath, RemarkBreaks]}
      rehypePlugins={[RehypeKatex]}
      components={{
        a: Link,
        img: Image,
        pre: 'div',
        code: Code
      }}
    >
      {source}
    </ReactMarkdown>
  );
};

export default Markdown;
