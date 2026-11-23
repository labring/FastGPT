import * as React from 'react';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkflowReferenceScope } from '@fastgpt/web/components/common/Textarea/PromptEditor/context';
import { ReferSelector } from '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/RenderInput/templates/Reference';
import { getWorkflowReferenceDisplayLabels } from '@/web/core/workflow/editor/WorkflowFieldScope';
import { VARIABLE_NODE_ID } from '@fastgpt/global/core/workflow/constants';
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
                sourceLabel: 'common:Delete',
                outputLabel: 'common:Cancel'
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

    expect(dom.window.document.body.textContent).toContain('common:Delete > common:Cancel');
    expect(dom.window.document.body.textContent).not.toContain('invalid_variable');
  });

  it('translates the built-in variable group and live system outputs, preserving custom names', () => {
    const outputLabel = 'common:core.module.http.AppId';
    const live = {
      code: 'valid' as const,
      reference: [VARIABLE_NODE_ID, 'appId'] as const,
      sourceLabel: 'common:core.module.Variable',
      outputLabel,
      localizeOutputLabel: true as const
    };
    const historical = {
      ...live,
      code: 'invalid_reference' as const,
      localizeOutputLabel: undefined
    };
    const custom = {
      ...live,
      sourceLabel: 'common:Delete',
      reference: ['source', 'appId'] as const,
      localizeOutputLabel: undefined
    };
    const translate = (key: string) => `translated(${key})`;
    expect(getWorkflowReferenceDisplayLabels([live, historical, custom], translate)).toMatchObject([
      { sourceLabel: translate(live.sourceLabel), outputLabel: translate(outputLabel) },
      { sourceLabel: translate(historical.sourceLabel), outputLabel },
      { sourceLabel: custom.sourceLabel, outputLabel }
    ]);
  });

  it('displays a legacy singleton in the array selector without writing it on mount', async () => {
    const onSelect = vi.fn();

    await act(async () => {
      root.render(
        createElement(ReferSelector, {
          isArray: true,
          list: [
            {
              label: 'Legacy source',
              value: 'source',
              children: [{ label: 'Legacy output', value: 'output' }]
            }
          ],
          value: ['source', 'output'],
          onSelect
        })
      );
    });

    expect(dom.window.document.body.textContent).toContain('Legacy source');
    expect(dom.window.document.body.textContent).toContain('Legacy output');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it.each([
    ['invalid_reference_type', '变量类型不匹配'],
    ['unreachable_reference', '变量已丢失']
  ] as const)('renders the localized tooltip for %s', async (code, label) => {
    await act(async () => {
      root.render(
        createElement(
          WorkflowReferenceScope,
          {
            references: [
              { code, reference: ['source', 'text'], sourceLabel: 'Source', outputLabel: 'Text' }
            ]
          },
          createElement(ReferSelector, { list: [], value: ['source', 'text'], onSelect: vi.fn() })
        )
      );
    });

    expect(dom.window.document.querySelector(`[aria-label="${label}"]`)).not.toBeNull();
  });

  it('uses the deleted variable tooltip when the source is missing', async () => {
    await act(async () => {
      root.render(
        createElement(ReferSelector, {
          list: [],
          value: ['deleted', 'token'],
          onSelect: vi.fn()
        })
      );
    });

    expect(dom.window.document.querySelector('[aria-label="变量已删除"]')).not.toBeNull();
  });
});
