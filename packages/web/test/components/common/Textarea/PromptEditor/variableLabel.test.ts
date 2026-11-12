// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import type * as React from 'react';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { getVariableLabelData } from '../../../../../components/common/Textarea/PromptEditor/plugins/VariableLabelPlugin';
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
            sourceLabel: 'Snapshot Source',
            outputLabel: 'Snapshot Output'
          }
        ],
        t
      })
    ).toEqual({
      variableLabel: 'Snapshot Source.Snapshot Output',
      nodeAvatar: '',
      invalidReason: 'invalid_reference'
    });
  });

  it('recognizes the static variable parent used by the global variable picker', () => {
    expect(
      getVariableLabelData({
        variableKey: '{{$system_global_variable.topic$}}',
        variables: [
          {
            key: 'topic',
            label: 'Topic',
            valueType: WorkflowIOValueTypeEnum.string,
            parent: { id: 'system_global_variable', label: 'Variables' }
          }
        ],
        t
      })
    ).toEqual({
      variableLabel: 'Variables.Topic',
      nodeAvatar: ''
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
});
