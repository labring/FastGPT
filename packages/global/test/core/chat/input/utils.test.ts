import { describe, expect, it } from 'vitest';
import {
  getUserChatSelect,
  formatUserChatSelect,
  userChatSelect2RuntimeText
} from '@fastgpt/global/core/chat/input/utils';
import type { UserChatSelectType } from '@fastgpt/global/core/chat/input/type';
import { removeEmptyUserInput } from '@fastgpt/global/core/chat/utils';

const select: UserChatSelectType = {
  type: 'agentAsk',
  questions: [
    { question: '输入方式？', value: 'upload' },
    { question: '补充？', value: '自定义说明' },
    { question: '其他？', value: '' }
  ]
};

describe('getUserChatSelect', () => {
  it('reads a valid input without requiring an original AI or association id', () => {
    expect(getUserChatSelect([{ select }])).toEqual(select);
  });

  it.each([
    undefined,
    [],
    [null, 'legacy', 0],
    [{ text: { content: '普通文本' } }],
    [{ select: null }],
    [{ select: { type: 'agentAsk' } }],
    [{ select: { type: 'agentAsk', questions: [] } }],
    [{ select: { type: 'agentAsk', questions: [{ question: 'Old?', answer: 'Legacy' }] } }]
  ])('ignores absent or malformed old data: %j', (values) => {
    expect(getUserChatSelect(values as Parameters<typeof getUserChatSelect>[0])).toBeUndefined();
  });

  it('preserves a submission that skips every question', () => {
    const value = {
      select: { ...select, questions: [{ question: '其他？', value: '' }] }
    };
    expect(removeEmptyUserInput([value])).toEqual([value]);
  });
});

describe('formatUserChatSelect', () => {
  it('formats saved values, custom answers and skipped questions', () => {
    expect(formatUserChatSelect(select)).toBe(
      '## 输入方式？\n\n回答：upload\n\n## 补充？\n\n回答：自定义说明\n\n## 其他？\n\n回答：未回答'
    );
  });
});

describe('userChatSelect2RuntimeText', () => {
  it('extracts the exact Ask values for the execution checkpoint', () => {
    expect(userChatSelect2RuntimeText(select)).toBe('{"answers":["upload","自定义说明",""]}');
  });

  it.each([
    { type: 'workflowBuilderPreview', action: 'confirm' },
    { type: 'workflowBuilderPreview', action: 'cancel' },
    { type: 'workflowBuilderPreview', action: 'revise', reviseText: 'Add review' }
  ] as const)('preserves a standalone preview $action reply without display labels', (reply) => {
    expect(getUserChatSelect([{ select: reply }])).toEqual(reply);
    const payload =
      reply.action === 'revise'
        ? { action: reply.action, reviseText: reply.reviseText }
        : { action: reply.action };
    expect(userChatSelect2RuntimeText(reply)).toBe(JSON.stringify(payload));
    expect(formatUserChatSelect(reply)).toBe(JSON.stringify(payload));
  });

  it('trims required revision text', () => {
    expect(
      getUserChatSelect([
        {
          select: { type: 'workflowBuilderPreview', action: 'revise', reviseText: '  Add review  ' }
        }
      ])
    ).toEqual({ type: 'workflowBuilderPreview', action: 'revise', reviseText: 'Add review' });
  });

  it.each([
    { type: 'workflowBuilderPreview', action: 'revise' },
    { type: 'workflowBuilderPreview', action: 'revise', reviseText: '   ' },
    { type: 'workflowBuilderPreview', action: 'confirm', reviseText: 'Invalid' },
    { type: 'workflowBuilderPreview', action: 'cancel', reviseText: 'Invalid' },
    { type: 'workflowBuilderPreview', action: 'confirm', reviseText: undefined },
    { type: 'workflowBuilderPreview', action: 'confirm', answer: 'Removed field' },
    { type: 'workflowBuilderPreview', action: 'unknown' },
    { type: 'workflowBuilderPreview', questions: [{ question: 'Old', value: 'Confirm' }] }
  ])('rejects an invalid Preview action payload: %j', (select) => {
    expect(
      getUserChatSelect([{ select }] as Parameters<typeof getUserChatSelect>[0])
    ).toBeUndefined();
  });
});
