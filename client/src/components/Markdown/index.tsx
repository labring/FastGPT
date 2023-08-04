import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import RemarkGfm from 'remark-gfm';
import RemarkMath from 'remark-math';
import RehypeKatex from 'rehype-katex';
import RemarkBreaks from 'remark-breaks';

import 'katex/dist/katex.min.css';
import styles from './index.module.scss';
import dynamic from 'next/dynamic';

import Link from './Link';
import CodeLight from './CodeLight';

const MermaidCodeBlock = dynamic(() => import('./img/MermaidCodeBlock'));
const MdImage = dynamic(() => import('./img/Image'));
const ChatGuide = dynamic(() => import('./chat/Guide'));

function Code({ inline, className, children, onClick }: any) {
  const match = /language-(\w+)/.exec(className || '');
  const codeType = match?.[1];

  if (codeType === 'mermaid') {
    return <MermaidCodeBlock code={String(children)} />;
  }

  if (codeType === 'guide') {
    return <ChatGuide text={String(children)} onClick={onClick} />;
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

const Markdown = ({
  source,
  isChatting = false,
  onClick
}: {
  source: string;
  isChatting?: boolean;
  onClick?: (e: any) => void;
}) => {
  const components = useMemo(
    () => ({
      a: Link,
      img: Image,
      pre: 'div',
      p: 'div',
      code: (props: any) => <Code {...props} onClick={onClick} />
    }),
    [onClick]
  );

  return (
    <ReactMarkdown
      className={`markdown ${styles.markdown}
      ${isChatting ? (source === '' ? styles.waitingAnimation : styles.animation) : ''}
    `}
      remarkPlugins={[RemarkGfm, RemarkMath, RemarkBreaks]}
      rehypePlugins={[RehypeKatex]}
      // @ts-ignore
      components={components}
    >
      {source}
    </ReactMarkdown>
  );
};

export default Markdown;
