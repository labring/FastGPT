import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import EditorContent from '@/pageComponents/chat/SandboxEditor/components/EditorContent';

const mocks = vi.hoisted(() => ({ preview: vi.fn(), toast: vi.fn() }));

vi.mock('@/pageComponents/chat/SandboxEditor/api', () => ({ getFilePreviewLink: mocks.preview }));
vi.mock('@chakra-ui/react', () => ({
  Box: ({ children }: React.PropsWithChildren) => React.createElement('div', null, children),
  Flex: ({ children }: React.PropsWithChildren) => React.createElement('div', null, children),
  Center: ({ children }: React.PropsWithChildren) => React.createElement('div', null, children),
  IconButton: ({ onClick, 'aria-label': label }: { onClick: () => void; 'aria-label': string }) =>
    React.createElement('button', { onClick, 'aria-label': label })
}));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/MyTooltip', () => ({
  default: ({ children }: React.PropsWithChildren) => children
}));
vi.mock('@fastgpt/web/components/common/Tag/index', () => ({
  default: ({ children }: React.PropsWithChildren) => children
}));
vi.mock('@fastgpt/web/components/common/Image/PhotoView', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => React.createElement('img', { src, alt })
}));
vi.mock('@fastgpt/web/components/common/Markdown', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/Tabs/FillRowTabs', () => ({ default: () => null }));
vi.mock('@/pageComponents/chat/SandboxEditor/components/MarkdownMetadataCard', () => ({
  default: () => null
}));
vi.mock('@monaco-editor/react', () => ({ default: () => null }));
vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: mocks.toast }) }));

/** 构造媒体标签及 HTML 预览按钮共用的最小编辑器状态。 */
const getProps = ({ language, content }: { language: string; content: string }) => {
  const activeFile = {
    name: 'file',
    path: 'file',
    content,
    language,
    isBinary: language !== 'html',
    isDirty: false,
    isLoading: false
  };
  return {
    activeFile,
    activeFilePath: activeFile.path,
    downloadingFile: false,
    downloadCurrentFile: vi.fn(),
    saveFile: vi.fn(),
    setOpenedFiles: vi.fn(),
    openedFiles: [activeFile],
    editorRef: { current: undefined },
    sandboxTarget: { appId: 'app-1' },
    chatId: 'chat-1'
  } satisfies React.ComponentProps<typeof EditorContent>;
};

afterEach(() => {
  vi.resetAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('SandboxEditor media preview sources', () => {
  it.each([
    { language: 'image', tag: 'img', content: 'https://fastgpt.example.com/preview/image.png' },
    { language: 'audio', tag: 'audio', content: 'http://localhost/preview/audio.mp3' },
    { language: 'video', tag: 'video', content: 'https://fastgpt.example.com/preview/video.mp4' },
    { language: 'image', tag: 'img', content: 'blob:existing-preview' }
  ])('renders $language with a supported URL source', (testCase) => {
    const html = renderToStaticMarkup(React.createElement(EditorContent, getProps(testCase)));

    expect(html).toContain(`<${testCase.tag}`);
    expect(html).toContain(`src="${testCase.content}"`);
  });

  it.each(['javascript:alert(1)', 'data:image/png;base64,AA==', 'file:///tmp/file.png'])(
    'keeps unsupported source %s in the binary fallback',
    (content) => {
      const html = renderToStaticMarkup(
        React.createElement(EditorContent, getProps({ language: 'image', content }))
      );

      expect(html).toContain('chat:sandbox_binary_file_no_preview');
      expect(html).not.toContain('<img');
    }
  );

  it('keeps binary formats without a media renderer in the existing fallback', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        EditorContent,
        getProps({ language: 'pdf', content: 'https://fastgpt.example.com/preview/file.pdf' })
      )
    );

    expect(html).toContain('chat:sandbox_binary_file_no_preview');
    expect(html).not.toContain('<iframe');
  });

  it('opens the URL from the generic HTML preview response', async () => {
    const dom = new JSDOM('<!doctype html><body></body>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('navigator', dom.window.navigator);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const open = vi.spyOn(dom.window, 'open').mockReturnValue(null);
    const url = 'https://fastgpt.example.com/preview/index.html?token=html';
    mocks.preview.mockResolvedValue({ url, expiresAt: Date.now() + 2 * 60 * 60 * 1000 });
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      await act(async () => {
        root.render(
          React.createElement(EditorContent, getProps({ language: 'html', content: '<h1>Hi</h1>' }))
        );
      });
      await act(async () => {
        document
          .querySelector<HTMLButtonElement>('[aria-label="chat:sandbox_html_preview"]')!
          .click();
      });

      expect(mocks.preview).toHaveBeenCalledWith({
        appId: 'app-1',
        chatId: 'chat-1',
        filePath: 'file',
        outLinkAuthData: undefined
      });
      expect(open).toHaveBeenCalledWith(url, '_blank');
    } finally {
      await act(async () => root.unmount());
      dom.window.close();
    }
  });

  it('shows saving state while dirty or saving, and shows save_failed tag when hasSaveError is set', () => {
    const baseProps = getProps({ language: 'html', content: '<p>test</p>' });

    const dirtyHtml = renderToStaticMarkup(
      React.createElement(EditorContent, {
        ...baseProps,
        activeFile: { ...baseProps.activeFile, isDirty: true, hasSaveError: false }
      })
    );
    expect(dirtyHtml).toContain('common:core.app.saving');

    const failedHtml = renderToStaticMarkup(
      React.createElement(EditorContent, {
        ...baseProps,
        activeFile: { ...baseProps.activeFile, isDirty: true, isSaving: false, hasSaveError: true }
      })
    );
    expect(failedHtml).toContain('chat:sandbox_save_failed');
    expect(failedHtml).not.toContain('common:core.app.saving');
  });
});
