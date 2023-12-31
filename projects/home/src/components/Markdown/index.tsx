import React from 'react';
import ReactMarkdown from 'react-markdown';
import RemarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';

import styles from './index.module.scss';

const Markdown = ({ source }: { source: string }) => {
  return (
    <ReactMarkdown
      className={`markdown ${styles.markdown}`}
      remarkPlugins={[RemarkBreaks, remarkGfm]}
    >
      {source}
    </ReactMarkdown>
  );
};

export default React.memo(Markdown);
