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
    { question: '输入方式？', value: 'upload', answer: '上传文件' },
    { question: '补充？', value: '自定义说明', answer: '自定义说明' },
    { question: '其他？', value: '', answer: '' }
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
    [{ select: { type: 'agentAsk' } }]
  ])('ignores absent or malformed old data: %j', (values) => {
    expect(getUserChatSelect(values as Parameters<typeof getUserChatSelect>[0])).toBeUndefined();
  });

  it('preserves a submission that skips every question', () => {
    const value = {
      select: { ...select, questions: [{ question: '其他？', value: '', answer: '' }] }
    };
    expect(removeEmptyUserInput([value])).toEqual([value]);
  });
});

describe('formatUserChatSelect', () => {
  it('formats option labels, raw values, custom answers and skipped questions', () => {
    expect(formatUserChatSelect(select)).toBe(
      '## 输入方式？\n\n回答：上传文件 - upload\n\n## 补充？\n\n回答：自定义说明\n\n## 其他？\n\n回答：未回答'
    );
  });
});

describe('userChatSelect2RuntimeText', () => {
  it('extracts the exact Ask values for the execution checkpoint', () => {
    expect(userChatSelect2RuntimeText(select)).toBe('{"answers":["upload","自定义说明",""]}');
  });

  it.each([undefined, '增加审核分支'])(
    'extracts preview feedback without copying its action into AI (feedback: %s)',
    (feedback) => {
      expect(
        userChatSelect2RuntimeText({
          type: 'workflowBuilderPreview',
          questions: [{ question: '确认？', value: 'confirm', answer: '开始搭建' }],
          feedback
        })
      ).toBe(feedback ?? '开始搭建');
    }
  );
});
