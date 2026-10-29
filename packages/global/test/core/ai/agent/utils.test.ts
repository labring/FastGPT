import { describe, expect, it } from 'vitest';
import {
  parseAgentAskArguments,
  parseAgentAskAnswers,
  formatAgentAskAnswers,
  hasUnfinishedAgentPlan
} from '../../../../core/ai/agent/utils';

describe('parseAgentAskArguments', () => {
  it('parses display values without changing the original string', () => {
    const raw =
      '{\n "questions": [{"question":" Choice? ","options":[{"value":" a ","summary":" A "},{"summary":"B","value":"b"}]}], "blockerType":"user_choice", "reason":"Why?", "extra":1\n}';
    expect(parseAgentAskArguments(raw)).toEqual({
      reason: 'Why?',
      blockerType: 'user_choice',
      questions: [
        {
          question: 'Choice?',
          options: [
            { summary: 'A', value: 'a' },
            { summary: 'B', value: 'b' }
          ]
        }
      ]
    });
    expect(raw).toContain('"question":" Choice? "');
  });

  it('derives legacy single-question display data from raw JSON', () => {
    expect(
      parseAgentAskArguments(
        JSON.stringify({
          reason: '',
          blockerType: 'user_choice',
          question: 'Choice?',
          options: ['A', 'B']
        })
      )
    ).toMatchObject({
      questions: [
        {
          question: 'Choice?',
          options: [
            { summary: 'A', value: 'A' },
            { summary: 'B', value: 'B' }
          ]
        }
      ]
    });
  });

  it.each([
    undefined,
    null,
    {},
    'not JSON',
    '{}',
    '{"reason":"a","blockerType":"user_choice","questions":[]}'
  ])('safely skips invalid arguments: %j', (value) => {
    expect(parseAgentAskArguments(value)).toBeUndefined();
  });
});

describe('parseAgentAskAnswers', () => {
  it.each([
    { raw: '{"answers":["A",""]}', expected: ['A', ''] },
    { raw: '{"answers":[]}', expected: [] },
    { raw: '{"answers":[1]}', expected: [] },
    { raw: '{}', expected: [] },
    { raw: 'invalid JSON', expected: [] }
  ])('reads valid answers and tolerates invalid input: $raw', ({ raw, expected }) => {
    expect(parseAgentAskAnswers(raw)).toEqual(expected);
  });
});

describe('formatAgentAskAnswers', () => {
  it.each([
    { answers: [], expected: '未回答' },
    { answers: ['A'], expected: 'A' },
    { answers: ['brief'], expected: 'Brief - brief' },
    { answers: ['custom'], expected: 'custom' }
  ])(
    'preserves choice descriptions, free text and missing answers: $expected',
    ({ answers, expected }) => {
      expect(
        formatAgentAskAnswers({
          questions: [
            {
              question: 'Format?',
              options: [
                { summary: 'A', value: 'A' },
                { summary: 'Brief', value: 'brief' }
              ]
            }
          ],
          answers
        })
      ).toBe(`## Format?\n\n回答：${expected}`);
    }
  );
});

describe('hasUnfinishedAgentPlan', () => {
  it.each([
    { status: 'pending' as const, expected: true },
    { status: 'done' as const, expected: false },
    { status: 'skipped' as const, expected: false }
  ])('recognizes $status steps', ({ status, expected }) => {
    expect(
      hasUnfinishedAgentPlan({
        planId: 'p',
        name: 'Plan',
        steps: [{ id: 's', name: 'Step', status }]
      })
    ).toBe(expected);
  });
});
