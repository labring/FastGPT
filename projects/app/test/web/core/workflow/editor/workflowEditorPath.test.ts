import { describe, expect, it } from 'vitest';
import {
  getWorkflowEditorPath,
  getWorkflowEditorPathPrefix
} from '@/web/core/workflow/editor/workflowEditorPath';

describe('workflow editor path', () => {
  it('isolates fields by app and editor session', () => {
    const params = { appId: 'app/1', sessionId: 'session 1' };

    expect(getWorkflowEditorPathPrefix(params)).toBe(
      'inmemory://fastgpt/workflow/app%2F1/session%201/'
    );
    expect(
      getWorkflowEditorPath({
        ...params,
        editorKind: 'json',
        nodeId: 'node/1',
        fieldKey: 'field.name'
      })
    ).toBe(
      'inmemory://fastgpt/workflow/app%2F1/session%201/json/%5B%22node%2F1%22%2C%22field.name%22%5D'
    );
  });

  it('keeps distinct field identities after URI path decoding', () => {
    const params = { appId: 'app', sessionId: 'session', editorKind: 'json' } as const;
    const modelPath = (nodeId: string, fieldKey: string) =>
      decodeURIComponent(new URL(getWorkflowEditorPath({ ...params, nodeId, fieldKey })!).pathname);

    expect(modelPath('a/b', 'c')).not.toBe(modelPath('a', 'b/c'));
    expect(modelPath('a/b', 'c')).not.toBe(modelPath('a%2Fb', 'c'));
  });

  it('does not create a reusable path before the host is identified', () => {
    expect(
      getWorkflowEditorPath({
        appId: '',
        sessionId: 'session',
        editorKind: 'code',
        nodeId: 'node',
        fieldKey: 'code'
      })
    ).toBeUndefined();
  });
});
