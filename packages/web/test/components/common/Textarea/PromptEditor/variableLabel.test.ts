// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import type * as React from 'react';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import {
  createLexicalComposerContext,
  LexicalComposerContext
} from '@lexical/react/LexicalComposerContext';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import LexicalErrorBoundary from '@lexical/react/LexicalErrorBoundary';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { PlainTextPlugin } from '@lexical/react/LexicalPlainTextPlugin';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isTextNode,
  createEditor,
  UNDO_COMMAND
} from 'lexical';
import { VARIABLE_NODE_ID, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { VariableLabelContext } from '../../../../../components/common/Textarea/PromptEditor/context';
import VariableLabelPlugin from '../../../../../components/common/Textarea/PromptEditor/plugins/VariableLabelPlugin';
import { VariableLabelNode } from '../../../../../components/common/Textarea/PromptEditor/plugins/VariableLabelPlugin/node';
import { getVariableLabelData } from '../../../../../components/common/Textarea/PromptEditor/plugins/VariableLabelPlugin/utils';
import VariableLabel from '../../../../../components/common/Textarea/PromptEditor/plugins/VariableLabelPlugin/components/VariableLabel';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('next-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => (key === 'common:invalid_variable' ? '无效变量' : key)
  })
}));
vi.mock('@chakra-ui/react', () => ({
  Box: ({ children }: React.PropsWithChildren) => createElement('div', null, children),
  Flex: ({ children }: React.PropsWithChildren) => createElement('div', null, children)
}));
vi.mock('@chakra-ui/icons', () => ({
  ChevronRightIcon: () => createElement('span', null, '>')
}));
vi.mock('../../../../../components/common/Avatar', () => ({ default: () => null }));
vi.mock('../../../../../components/common/MyTooltip', () => ({
  default: ({ children }: { children: React.ReactNode }) => children
}));

const t = (key: string) => key;

describe('VariableLabel', () => {
  it('uses the field reference list before the current variables list', () => {
    expect(
      getVariableLabelData({
        variableKey: '{{$source.value$}}',
        variables: [
          {
            key: 'value',
            label: 'Live Label',
            valueType: WorkflowIOValueTypeEnum.number,
            parent: { id: 'source', label: 'Live Source' }
          }
        ],
        references: [
          {
            code: 'invalid_reference',
            reference: ['source', 'value'],
            sourceLabel: 'Snapshot Source',
            outputLabel: 'Snapshot Output'
          }
        ],
        t
      })
    ).toEqual({
      variableLabel: 'Live Source.Live Label',
      nodeAvatar: '',
      invalidReason: 'invalid_reference'
    });
  });

  it('uses snapshot labels when the source has disappeared from the current variable list', () => {
    expect(
      getVariableLabelData({
        variableKey: '{{$source.value$}}',
        variables: [],
        references: [
          {
            code: 'invalid_reference',
            reference: ['source', 'value'],
            sourceLabel: 'common:Input',
            outputLabel: 'common:Delete'
          }
        ],
        t: (key) => (key === 'common:Input' ? '输入' : key === 'common:Delete' ? '删除' : t(key))
      })
    ).toEqual({
      variableLabel: 'common:Input.common:Delete',
      nodeAvatar: '',
      invalidReason: 'invalid_reference'
    });
  });

  it('keeps a custom global variable label verbatim in live and historical references', () => {
    const variableKey = `{{$${VARIABLE_NODE_ID}.topic$}}`;
    const t = (key: string) =>
      ({ 'common:Delete': '删除', 'common:core.module.Variable': '变量' })[key] ?? key;
    expect(
      getVariableLabelData({
        variableKey,
        variables: [
          {
            key: 'topic',
            label: 'common:Delete',
            valueType: WorkflowIOValueTypeEnum.string,
            parent: { id: VARIABLE_NODE_ID, label: '变量' }
          }
        ],
        t
      })
    ).toEqual({
      variableLabel: '变量.common:Delete',
      nodeAvatar: ''
    });
    expect(
      getVariableLabelData({
        variableKey,
        variables: [],
        references: [
          {
            code: 'invalid_reference',
            reference: [VARIABLE_NODE_ID, 'topic'],
            sourceLabel: 'common:core.module.Variable',
            outputLabel: 'common:Delete'
          }
        ],
        t
      })
    ).toEqual({
      variableLabel: '变量.common:Delete',
      nodeAvatar: '',
      invalidReason: 'invalid_reference'
    });
  });

  it('keeps the token visible when no live or snapshot label exists', () => {
    expect(
      getVariableLabelData({
        variableKey: '{{$source.value$}}',
        variables: [],
        t
      }).variableLabel
    ).toBe('undefined.value');
  });

  it('renders the invalid variable fallback with the key suffix', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    act(() => {
      root.render(
        createElement(VariableLabel, {
          variableKey: '{{$source.value$}}',
          variableLabel: 'undefined.value',
          nodeAvatar: '',
          invalidReason: 'invalid_reference'
        })
      );
    });

    expect(host.textContent).toContain('无效变量: value');
    act(() => root.unmount());
    host.remove();
  });

  it('refreshes labels without consuming the first text undo', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const editor = createEditor({
      namespace: 'prompt-undo',
      nodes: [VariableLabelNode],
      onError: (error: Error) => {
        throw error;
      }
    });
    const context = createLexicalComposerContext(null, undefined);
    const token = '{{$source.value$}}';
    const render = (label: string) =>
      act(async () => {
        root.render(
          createElement(
            VariableLabelContext.Provider,
            {
              value: [
                {
                  key: 'value',
                  label: 'Value',
                  valueType: WorkflowIOValueTypeEnum.string,
                  parent: { id: 'source', label }
                }
              ]
            },
            createElement(
              LexicalComposerContext.Provider,
              { value: [editor, context] },
              createElement(PlainTextPlugin, {
                contentEditable: createElement(ContentEditable),
                placeholder: null,
                ErrorBoundary: LexicalErrorBoundary
              }),
              createElement(HistoryPlugin),
              createElement(VariableLabelPlugin)
            )
          )
        );
      });

    try {
      await render('Before rename');
      await act(async () => {
        editor.update(
          () => {
            $getRoot()
              .clear()
              .append($createParagraphNode().append($createTextNode(token + ' before edit')));
          },
          { discrete: true, tag: 'history-push' }
        );
      });
      expect(host.textContent).toContain('Before rename');
      await act(async () => {
        editor.update(
          () => {
            const text = $getRoot().getLastDescendant();
            if (!$isTextNode(text)) throw new Error('Expected editable prompt text');
            text.setTextContent(' after edit');
          },
          { discrete: true, tag: 'history-push' }
        );
      });
      await render('After rename');
      expect(host.textContent).toContain('After rename');
      expect(host.textContent).toContain('after edit');
      await act(async () => {
        editor.dispatchCommand(UNDO_COMMAND, undefined);
      });
      expect(editor.getEditorState().read(() => $getRoot().getTextContent())).toBe(
        token + ' before edit'
      );
      expect(host.textContent).toContain('After rename');
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  });
});
