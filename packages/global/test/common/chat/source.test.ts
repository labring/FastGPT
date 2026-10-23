import { describe, expect, it } from 'vitest';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import {
  isAppSandboxSourceType,
  isAuxiliaryGenerationSourceType,
  isSandboxSourceType,
  requiresExplicitChatSourceType
} from '@fastgpt/global/common/chat/source';

const sourceTypes = [
  ChatSourceTypeEnum.app,
  ChatSourceTypeEnum.workflowBuilder,
  ChatSourceTypeEnum.skillEdit,
  ChatSourceTypeEnum.chatAgentHelper
] as const;

describe.each([
  {
    name: 'isAppSandboxSourceType',
    predicate: isAppSandboxSourceType,
    expected: [true, true, false, false]
  },
  {
    name: 'isSandboxSourceType',
    predicate: isSandboxSourceType,
    expected: [true, true, true, false]
  },
  {
    name: 'isAuxiliaryGenerationSourceType',
    predicate: isAuxiliaryGenerationSourceType,
    expected: [false, true, false, true]
  },
  {
    name: 'requiresExplicitChatSourceType',
    predicate: requiresExplicitChatSourceType,
    expected: [false, true, true, true]
  }
])('$name', ({ predicate, expected }) => {
  it.each(sourceTypes.map((sourceType, index) => ({ sourceType, result: expected[index] })))(
    'classifies $sourceType as $result',
    ({ sourceType, result }) => {
      expect(predicate(sourceType)).toBe(result);
    }
  );

  it('rejects missing and unsupported source values', () => {
    for (const sourceType of [undefined, null, 'unknown', {}, 1]) {
      expect(predicate(sourceType)).toBe(false);
    }
  });
});
