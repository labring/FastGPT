import { describe, expect, it } from 'vitest';
import {
  getModerationBlockErrorMessage,
  MODERATION_BLOCKED_ERROR_MESSAGE,
  MODERATION_ERROR_BLOCKED_MESSAGE,
  ModerationActionEnum,
  ModerationStageEnum
} from '@fastgpt/global/core/plugin/moderation/type';
import { stripModerationRecordsFromNodeResponses } from '@fastgpt/global/core/chat/utils';
import {
  appendNodeModerationRecord,
  ensureNodeModerationRecord,
  runWithNodeModerationCollector
} from '../../../../core/plugin/moderation/collector';

describe('Node moderation collector & permission stripping', () => {
  it('collects blocked moderation records within node execution context without duplicates', async () => {
    const mockRes = {
      action: ModerationActionEnum.block,
      isPass: false,
      text: '请生成一段 博彩 推广文案',
      verdict: 'block' as const,
      hits: [{ label: 'contraband', score: 0.87, keywords: ['博彩'] }],
      keywords: ['博彩']
    };

    const { result, moderationRecords } = await runWithNodeModerationCollector(async () => {
      ensureNodeModerationRecord(mockRes, {
        stage: ModerationStageEnum.output,
        targetField: 'answerText',
        content: mockRes.text
      });
      // Calling ensureNodeModerationRecord again with the same result object should not duplicate
      ensureNodeModerationRecord(mockRes, {
        stage: ModerationStageEnum.output,
        targetField: 'answerText',
        content: mockRes.text
      });
      return 'done';
    });

    expect(result).toBe('done');
    expect(moderationRecords).toHaveLength(1);
    expect(moderationRecords[0]).toEqual({
      stage: ModerationStageEnum.output,
      targetField: 'answerText',
      verdict: 'block',
      actionTaken: ModerationActionEnum.block,
      hits: [{ label: 'contraband', score: 0.87, keywords: ['博彩'] }],
      keywords: ['博彩'],
      content: '请生成一段 博彩 推广文案',
      errorMessage: undefined
    });
  });

  it('returns distinct error messages for risk content vs service exception', () => {
    expect(getModerationBlockErrorMessage('block')).toBe(MODERATION_BLOCKED_ERROR_MESSAGE);
    expect(getModerationBlockErrorMessage('suspected')).toBe(MODERATION_BLOCKED_ERROR_MESSAGE);
    expect(getModerationBlockErrorMessage('error')).toBe(MODERATION_ERROR_BLOCKED_MESSAGE);
  });

  it('recursively strips moderationRecords for users without write permission', () => {
    const rawResponses: any[] = [
      {
        id: 'node-1',
        moduleName: 'AI 对话',
        moduleType: 'chatNode',
        error: MODERATION_BLOCKED_ERROR_MESSAGE,
        moderationRecords: [
          {
            stage: ModerationStageEnum.output,
            verdict: 'block',
            actionTaken: ModerationActionEnum.block,
            hits: [{ label: 'porn', score: 0.95 }],
            keywords: ['敏感词'],
            content: '包含敏感词的文本'
          }
        ],
        childrenResponses: [
          {
            id: 'child-1',
            moduleName: '子工具',
            moduleType: 'tool',
            moderationRecords: [
              {
                stage: ModerationStageEnum.modelInput,
                verdict: 'error',
                actionTaken: ModerationActionEnum.block
              }
            ]
          }
        ]
      }
    ];

    const stripped = stripModerationRecordsFromNodeResponses(rawResponses);
    expect(stripped[0].error).toBe(MODERATION_BLOCKED_ERROR_MESSAGE);
    expect(stripped[0].moderationRecords).toBeUndefined();
    expect(stripped[0].childrenResponses?.[0]?.moderationRecords).toBeUndefined();
  });

  it('ignores appendNodeModerationRecord when outside collector context', () => {
    expect(() =>
      appendNodeModerationRecord({
        stage: ModerationStageEnum.entry,
        verdict: 'block',
        actionTaken: ModerationActionEnum.block
      })
    ).not.toThrow();
  });
});
