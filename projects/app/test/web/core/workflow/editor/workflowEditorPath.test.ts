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
    ).toBe('inmemory://fastgpt/workflow/app%2F1/session%201/json/node%2F1/field.name');
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
