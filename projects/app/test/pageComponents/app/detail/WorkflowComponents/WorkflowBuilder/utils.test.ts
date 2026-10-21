import { describe, expect, it } from 'vitest';
import { mergeWorkflowBuilderAppliedAppDetail } from '@/pageComponents/app/detail/WorkflowComponents/WorkflowBuilder/utils';
import { WorkflowDocumentSchema } from '@fastgpt/global/core/workflow/type/document';
import fixture from '@fastgpt/workflow-core/test/fixtures/basic-static/workflow.json';

describe('mergeWorkflowBuilderAppliedAppDetail', () => {
  it('keeps user-owned app metadata while applying Builder chatConfig', () => {
    const document = WorkflowDocumentSchema.parse(structuredClone(fixture));
    document.app.name = 'Builder Result';
    document.app.intro = 'Updated by Builder';
    document.chatConfig.fileSelectConfig = { maxFiles: 1, canSelectFile: true };

    const current = {
      name: 'Old Name',
      intro: 'Old intro',
      chatConfig: {}
    } as Parameters<typeof mergeWorkflowBuilderAppliedAppDetail>[0]['current'];

    expect(
      mergeWorkflowBuilderAppliedAppDetail({
        current,
        chatConfig: document.chatConfig
      })
    ).toMatchObject({
      name: 'Old Name',
      intro: 'Old intro',
      chatConfig: {
        fileSelectConfig: { maxFiles: 1, canSelectFile: true }
      }
    });
  });
});
