import * as React from 'react';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkflowReferenceScope } from '@fastgpt/web/components/common/Textarea/PromptEditor/context';
import { ReferSelector } from '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/RenderInput/templates/Reference';
import commonZh from '@fastgpt/web/i18n/zh-CN/common.json';

vi.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      const text = (commonZh as Record<string, string>)[key.replace('common:', '')] ?? key;
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String(params?.[name] ?? ''));
    }
  })
}));
vi.mock('@fastgpt/web/components/common/MySelect/MultipleRowSelect', () => ({
  MultipleRowSelect: ({ label }: { label: React.ReactNode }) => label,
  MultipleRowArraySelect: ({ label }: { label: React.ReactNode }) => label
}));
vi.mock('@fastgpt/web/components/common/Avatar', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/MyTooltip', () => ({
  default: ({ children }: { children: React.ReactNode }) => children
}));

describe('ReferSelector missing reference label', () => {
  let dom: JSDOM;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    dom = new JSDOM('<div id="root"></div>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('React', React);
    root = createRoot(dom.window.document.getElementById('root')!);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    vi.unstubAllGlobals();
  });

  it('renders the snapshot source and output labels for an invalid reference', async () => {
    await act(async () => {
      root.render(
        createElement(
          WorkflowReferenceScope,
          {
            references: [
              {
                code: 'invalid_reference',
                reference: ['deleted', 'token'],
                sourceLabel: 'Deleted Node',
                outputLabel: 'Token'
              }
            ]
          },
          createElement(ReferSelector, {
            list: [],
            value: ['deleted', 'token'],
            onSelect: vi.fn()
          })
        )
      );
    });

    expect(dom.window.document.body.textContent).toContain('Deleted Node');
    expect(dom.window.document.body.textContent).toContain('Token');
    expect(dom.window.document.body.textContent).not.toContain('invalid_variable');
  });

  it('renders the reference type mismatch tooltip instead of its i18n key', async () => {
    await act(async () => {
      root.render(
        createElement(
          WorkflowReferenceScope,
          {
            references: [
              {
                code: 'invalid_reference_type',
                reference: ['source', 'text'],
                sourceLabel: 'Source',
                outputLabel: 'Text'
              }
            ]
          },
          createElement(ReferSelector, {
            inputName: 'Text',
            list: [],
            value: ['source', 'text'],
            onSelect: vi.fn()
          })
        )
      );
    });

    expect(
      dom.window.document.querySelector('[aria-label="Text 引用的变量类型不匹配，需处理"]')
    ).not.toBeNull();
  });

  it('renders the unreachable reference tooltip instead of its i18n key', async () => {
    await act(async () => {
      root.render(
        createElement(
          WorkflowReferenceScope,
          {
            references: [
              {
                code: 'unreachable_reference',
                reference: ['source', 'text'],
                sourceLabel: 'Source',
                outputLabel: 'Text'
              }
            ]
          },
          createElement(ReferSelector, {
            inputName: 'Text',
            list: [],
            value: ['source', 'text'],
            onSelect: vi.fn()
          })
        )
      );
    });

    const labels = [...dom.window.document.querySelectorAll('[aria-label]')].map((element) =>
      element.getAttribute('aria-label')
    );
    expect(labels).toContain('Text 引用的来源已不在当前连线范围内，需处理');
  });
});
