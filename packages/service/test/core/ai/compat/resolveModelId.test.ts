import { describe, expect, it, beforeEach } from 'vitest';
import { resolveModelId } from '@fastgpt/service/core/ai/compat/resolveModelId';
import type { SystemModelItemType } from '@fastgpt/service/core/ai/model/type';

const makeModel = (id: string, overrides: Partial<SystemModelItemType> = {}): SystemModelItemType =>
  ({
    type: 'llm',
    provider: 'test',
    model: 'gpt-4o',
    name: 'GPT-4o',
    maxContext: 16000,
    isActive: true,
    isSystem: true,
    id,
    ...overrides
  }) as SystemModelItemType;

describe('resolveModelId', () => {
  beforeEach(() => {
    globalThis.systemModelList = [
      makeModel('sys-llm-1', { model: 'gpt-4o', name: 'GPT-4o', isSystem: true }),
      makeModel('team-llm-1', {
        model: 'qwen-plus',
        name: 'Qwen Plus',
        isSystem: false,
        teamId: 'team-a'
      }),
      makeModel('team-llm-2', {
        model: 'qwen-plus',
        name: 'Qwen Plus',
        isSystem: false,
        teamId: 'team-b'
      })
    ];
    globalThis.systemActiveModelList = [...globalThis.systemModelList];
    globalThis.systemModelIdMap = new Map(globalThis.systemModelList.map((m) => [m.id, m]));
    globalThis.systemModelNameMap = new Map([
      ['gpt-4o', globalThis.systemModelList[0]],
      ['GPT-4o', globalThis.systemModelList[0]],
      ['qwen-plus', globalThis.systemModelList[1]],
      ['Qwen Plus', globalThis.systemModelList[1]]
    ]);
    globalThis.llmModelNameMap = new Map();
    globalThis.embeddingModelNameMap = new Map();
    globalThis.ttsModelNameMap = new Map();
    globalThis.sttModelNameMap = new Map();
    globalThis.reRankModelNameMap = new Map();
  });

  it('returns valid ObjectId that exists in system as-is', () => {
    expect(resolveModelId('507f1f77bcf86cd799439011', 'team-a')).toBe('507f1f77bcf86cd799439011');
  });

  it('does not resolve a disabled model ObjectId (keeps value)', () => {
    globalThis.systemModelList = [
      makeModel('507f1f77bcf86cd799439011', { model: 'gpt-4o', name: 'GPT-4o', isSystem: true }),
      makeModel('507f1f77bcf86cd799439012', {
        model: 'legacy-disabled',
        name: 'Legacy Disabled',
        isSystem: true,
        isActive: false
      })
    ];
    globalThis.systemActiveModelList = [globalThis.systemModelList[0]];
    globalThis.systemModelIdMap = new Map(globalThis.systemModelList.map((m) => [m.id, m]));
    // id exists in the map but the model is disabled → falls through, input kept
    expect(resolveModelId('507f1f77bcf86cd799439012', 'team-a')).toBe('507f1f77bcf86cd799439012');
  });

  it('matches model name to system model id', () => {
    expect(resolveModelId('gpt-4o', 'team-a')).toBe('sys-llm-1');
  });

  it('matches name alias to system model id', () => {
    expect(resolveModelId('GPT-4o', 'team-a')).toBe('sys-llm-1');
  });

  it('prefers system model over same-team model when both match', () => {
    // 'qwen-plus' matches both team-a and team-b models, but no system model
    expect(resolveModelId('qwen-plus', 'team-a')).toBe('team-llm-1');
  });

  it('filters to same-team model only', () => {
    // team-b has its own qwen-plus; team-a request must not resolve to it
    const teamA = resolveModelId('qwen-plus', 'team-a');
    expect(teamA).toBe('team-llm-1');
    const teamB = resolveModelId('qwen-plus', 'team-b');
    expect(teamB).toBe('qwen-plus');
  });

  it('returns original input when no match (keeps value, no throw)', () => {
    expect(resolveModelId('unknown-model', 'team-a')).toBe('unknown-model');
  });

  it('returns original input when teamId is unknown', () => {
    expect(resolveModelId('team-model-only', 'team-z')).toBe('team-model-only');
  });

  it('returns original input when systemModelList is empty', () => {
    globalThis.systemModelList = [];
    globalThis.systemActiveModelList = [];
    globalThis.systemModelIdMap = new Map();
    globalThis.systemModelNameMap = new Map();
    expect(resolveModelId('gpt-4o', 'team-a')).toBe('gpt-4o');
  });

  it('does not resolve to an inactive model by legacy name', () => {
    globalThis.systemModelList = [
      makeModel('sys-llm-1', { model: 'gpt-4o', name: 'GPT-4o', isSystem: true }),
      makeModel('sys-inactive-1', {
        model: 'legacy-disabled',
        name: 'Legacy Disabled',
        isSystem: true,
        isActive: false
      })
    ];
    globalThis.systemActiveModelList = [globalThis.systemModelList[0]];
    globalThis.systemModelIdMap = new Map(globalThis.systemModelList.map((m) => [m.id, m]));
    expect(resolveModelId('legacy-disabled', 'team-a')).toBe('legacy-disabled');
  });
});

describe('resolveModelId — legacy-name compat index fast path (hot-upgrade)', () => {
  beforeEach(() => {
    globalThis.systemModelList = [
      makeModel('sys-llm-1', { model: 'gpt-4o', name: 'GPT-4o', isSystem: true }),
      makeModel('team-llm-1', {
        model: 'qwen-plus',
        name: 'Qwen Plus',
        isSystem: false,
        teamId: 'team-a'
      }),
      makeModel('team-llm-2', {
        model: 'qwen-plus',
        name: 'Qwen Plus',
        isSystem: false,
        teamId: 'team-b'
      })
    ];
    globalThis.systemActiveModelList = [...globalThis.systemModelList];
    globalThis.systemModelIdMap = new Map(globalThis.systemModelList.map((m) => [m.id, m]));
    // Compat index mirrors loadSystemModels: model name + alias keys, first-wins
    // with active/system priority — 'qwen-plus' resolves to team-llm-1 here.
    globalThis.systemModelNameMap = new Map([
      ['gpt-4o', globalThis.systemModelList[0]],
      ['GPT-4o', globalThis.systemModelList[0]],
      ['qwen-plus', globalThis.systemModelList[1]],
      ['Qwen Plus', globalThis.systemModelList[1]]
    ]);
    globalThis.embeddingModelNameMap = new Map();
    globalThis.ttsModelNameMap = new Map();
    globalThis.sttModelNameMap = new Map();
    globalThis.reRankModelNameMap = new Map();
  });

  it('resolves a system model name via the index', () => {
    expect(resolveModelId('gpt-4o', 'team-a')).toBe('sys-llm-1');
    expect(resolveModelId('GPT-4o', 'team-a')).toBe('sys-llm-1');
  });

  it('resolves a system model name via the index WITHOUT teamId (system-only scope)', () => {
    expect(resolveModelId('gpt-4o')).toBe('sys-llm-1');
  });

  it('resolves a same-team private model via the index', () => {
    // Index holds team-llm-1 for 'qwen-plus'; a team-a request hits it directly
    expect(resolveModelId('qwen-plus', 'team-a')).toBe('team-llm-1');
  });

  it('does NOT resolve a private model by name without teamId (security)', () => {
    expect(resolveModelId('qwen-plus')).toBe('qwen-plus');
  });

  it('keeps deterministic first-wins when a private index hit belongs to another team', () => {
    expect(resolveModelId('qwen-plus', 'team-b')).toBe('qwen-plus');
  });

  it('does not resolve a name whose only index hit is an inactive model', () => {
    globalThis.systemModelNameMap.set(
      'legacy-disabled',
      makeModel('sys-inactive-1', {
        model: 'legacy-disabled',
        name: 'Legacy Disabled',
        isSystem: true,
        isActive: false
      }) as LLMModelItemType
    );
    expect(resolveModelId('legacy-disabled', 'team-a')).toBe('legacy-disabled');
  });

  it('does not use the name index for ObjectId-shaped input', () => {
    globalThis.llmModelNameMap.set(
      '507f1f77bcf86cd799439011',
      makeModel('sys-llm-oid', {
        model: '507f1f77bcf86cd799439011',
        isSystem: true
      }) as LLMModelItemType
    );
    expect(resolveModelId('507f1f77bcf86cd799439011', 'team-a')).toBe('507f1f77bcf86cd799439011');
  });

  it('keeps the original input when the name is missing from the index', () => {
    expect(resolveModelId('unknown-model', 'team-a')).toBe('unknown-model');
  });
});
