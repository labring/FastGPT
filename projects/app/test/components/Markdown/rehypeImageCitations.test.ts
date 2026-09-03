import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import RemarkBreaks from 'remark-breaks';
import { describe, expect, it } from 'vitest';

import {
  imageCitationParagraphClassName,
  rehypeImageCitations
} from '@/components/Markdown/rehypeImageCitations';

const renderMarkdown = (source: string) =>
  renderToStaticMarkup(
    React.createElement(
      ReactMarkdown,
      {
        remarkPlugins: [RemarkBreaks],
        rehypePlugins: [rehypeImageCitations]
      },
      source
    )
  );

describe('rehypeImageCitations', () => {
  it.each([
    '![image](https://example.com/image.png)[507f1f77bcf86cd799439011](CITE)',
    '![image](https://example.com/image.png)\n[507f1f77bcf86cd799439011](CITE)',
    '![image](https://example.com/image.png)[507f1f77bcf86cd799439011](CITE)[507f191e810c19729de860ea](QUOTE)'
  ])('marks an image paragraph whose remaining content only contains citations', (source) => {
    expect(renderMarkdown(source)).toContain(`<p class="${imageCitationParagraphClassName}">`);
  });

  it.each([
    '[507f1f77bcf86cd799439011](CITE)',
    'caption ![image](https://example.com/image.png)[507f1f77bcf86cd799439011](CITE)',
    '![image](https://example.com/image.png) caption [507f1f77bcf86cd799439011](CITE)'
  ])('does not mark citations that are part of ordinary text: %s', (source) => {
    expect(renderMarkdown(source)).not.toContain(imageCitationParagraphClassName);
  });
});
