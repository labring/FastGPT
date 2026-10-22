/* eslint-disable react/no-children-prop */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import ReactMarkdown from 'react-markdown';
import RehypeExternalLinks from 'rehype-external-links';
import RehypeKatex from 'rehype-katex';
import RemarkMath from 'remark-math';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';

import { fastgptMarkdownSanitizeSchema } from '@/components/Markdown/utils/sanitizeSchema';
import VideoBlock from '@/components/Markdown/components/Video';
import AudioBlock from '@/components/Markdown/components/Audio';
import Input from '@/components/Markdown/components/Input';
import Textarea from '@/components/Markdown/components/Textarea';
import Progress from '@/components/Markdown/components/Progress';
import { MarkdownRendererRuntimeContext } from '@/components/Markdown/utils/runtimeContext';

vi.mock('next-i18next', () => ({
  useTranslation: () => ({
    t: (str: string) => str
  })
}));

// 正确的插件流水线：rehypeRaw -> rehypeSanitize -> RehypeKatex -> RehypeExternalLinks
const testPlugins = [
  rehypeRaw,
  [rehypeSanitize, fastgptMarkdownSanitizeSchema],
  RehypeKatex,
  [RehypeExternalLinks, { target: '_blank' }]
];

const testComponents = {
  video: ({ node, ...props }: any) => React.createElement(VideoBlock, props),
  audio: ({ node, ...props }: any) => React.createElement(AudioBlock, props),
  details: ({ node, children, ...props }: any) => React.createElement('details', props, children),
  summary: ({ node, children, ...props }: any) => React.createElement('summary', props, children),
  mark: ({ node, children, ...props }: any) => React.createElement('mark', props, children),
  kbd: ({ node, children, ...props }: any) => React.createElement('kbd', props, children),
  font: ({ node, color, children, ...props }: any) =>
    React.createElement('span', { style: { color }, ...props }, children),
  progress: ({ node, ...props }: any) => React.createElement(Progress, props),
  input: ({ node, ...props }: any) => React.createElement(Input, props),
  textarea: ({ node, ...props }: any) => React.createElement(Textarea, props)
};

const renderMarkdown = (source: string, contextValue: any = {}) => {
  return renderToStaticMarkup(
    React.createElement(
      MarkdownRendererRuntimeContext.Provider,
      {
        value: {
          showAnimation: false,
          ...contextValue
        }
      },
      React.createElement(ReactMarkdown, {
        remarkPlugins: [RemarkMath as any],
        rehypePlugins: testPlugins as any,
        components: testComponents as any,
        children: source
      })
    )
  );
};

describe('Markdown Controlled HTML Rendering & Sanitization', () => {
  describe('XSS & Dangerous Attribute Stripping', () => {
    it('should strip script tags completely', () => {
      const html = renderMarkdown('<script>alert("xss")</script>Hello');
      expect(html).not.toContain('<script');
      expect(html).not.toContain('alert("xss")');
      expect(html).toContain('Hello');
    });

    it('should strip inline onerror/onload event handlers', () => {
      const html = renderMarkdown('<img src="https://example.com/pic.png" onerror="alert(1)" />');
      expect(html).toContain('<img');
      expect(html).not.toContain('onerror');
      expect(html).not.toContain('alert(1)');
    });

    it('should strip inline ontoggle event on details tag', () => {
      const html = renderMarkdown(
        '<details ontoggle="alert(1)" open><summary>Title</summary>Body</details>'
      );
      expect(html).toContain('<details');
      expect(html).not.toContain('ontoggle');
      expect(html).toContain('Title');
      expect(html).toContain('Body');
    });

    it('should strip inline style attributes to prevent layout hijacking', () => {
      const html = renderMarkdown(
        '<div style="position:fixed;top:0;left:0;width:100vw;height:100vh;">Trap</div>'
      );
      expect(html).not.toContain('style=');
      expect(html).not.toContain('position:fixed');
      expect(html).toContain('Trap');
    });

    it('should block javascript: protocol in video and link src', () => {
      const html = renderMarkdown('<video src="javascript:alert(1)"></video>');
      expect(html).not.toContain('javascript:alert(1)');
    });
  });

  describe('Permitted Rich HTML Elements', () => {
    it('should safely render details and summary tags', () => {
      const html = renderMarkdown(
        '<details open><summary>Thinking Process</summary><p>Detailed reasoning</p></details>'
      );
      expect(html).toContain('<details');
      expect(html).toContain('open=""');
      expect(html).toContain('<summary>Thinking Process</summary>');
      expect(html).toContain('Detailed reasoning');
    });

    it('should render mark and kbd tags', () => {
      const html = renderMarkdown('<mark>highlighted</mark> and <kbd>Ctrl+C</kbd>');
      expect(html).toContain('<mark>highlighted</mark>');
      expect(html).toContain('<kbd>Ctrl+C</kbd>');
    });

    it('should correctly render KaTeX math expressions without leaking raw markup or duplication', () => {
      const html = renderMarkdown('Energy formula: $E = mc^2$');
      expect(html).toContain('class="katex"');
      expect(html).toContain('class="katex-html"');
      expect(html).not.toContain('E=mc2E = mc^2E=mc2');
    });

    it('should render font tag attributes safely', () => {
      const html = renderMarkdown('<font color="red">Warning Text</font>');
      expect(html).toContain('Warning Text');
    });

    it('should render Chakra UI progress tag with value and max', () => {
      const html = renderMarkdown('<progress value="75" max="100"></progress>');
      expect(html).toContain('role="progressbar"');
      expect(html).toContain('aria-valuenow="75"');
    });

    it('should render Chakra UI input component for text, checkbox and radio', () => {
      const textHtml = renderMarkdown(
        '<input type="text" placeholder="Your name" value="FastGPT" />'
      );
      expect(textHtml).toContain('chakra-input');
      expect(textHtml).toContain('placeholder="Your name"');

      const checkboxHtml = renderMarkdown('<input type="checkbox" checked />');
      expect(checkboxHtml).toContain('chakra-checkbox');

      const radioHtml = renderMarkdown('<input type="radio" checked />');
      expect(radioHtml).toContain('chakra-radio');
    });

    it('should render Chakra UI textarea component', () => {
      const html = renderMarkdown(
        '<textarea placeholder="Leave comments" rows="4">Initial text</textarea>'
      );
      expect(html).toContain('chakra-textarea');
      expect(html).toContain('placeholder="Leave comments"');
      expect(html).toContain('Initial text');
    });
  });

  describe('Media Streaming & Delayed Rendering Strategy', () => {
    it('should render lightweight placeholder during streaming (showAnimation = true)', () => {
      const html = renderMarkdown('<video src="https://example.com/stream.mp4" controls></video>', {
        showAnimation: true
      });
      expect(html).not.toContain('<video');
      expect(html).toContain('common:video_preparing');
    });

    it('should render native video player after streaming is complete (showAnimation = false)', () => {
      const html = renderMarkdown('<video src="https://example.com/final.mp4" controls></video>', {
        showAnimation: false
      });
      expect(html).toContain('<video');
      expect(html).toContain('src="https://example.com/final.mp4"');
      expect(html).toContain('controls=""');
      expect(html).not.toContain('common:video_preparing');
    });

    it('should support audio tag with streaming placeholder and post-stream player', () => {
      const streamingHtml = renderMarkdown(
        '<audio src="https://example.com/voice.mp3" controls></audio>',
        {
          showAnimation: true
        }
      );
      expect(streamingHtml).not.toContain('<audio');
      expect(streamingHtml).toContain('common:audio_preparing');

      const finalHtml = renderMarkdown(
        '<audio src="https://example.com/voice.mp3" controls></audio>',
        {
          showAnimation: false
        }
      );
      expect(finalHtml).toContain('<audio');
      expect(finalHtml).toContain('src="https://example.com/voice.mp3"');
      expect(finalHtml).not.toContain('common:audio_preparing');
    });
  });
});
