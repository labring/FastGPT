import { describe, expect, it } from 'vitest';
import {
  formatRefKey,
  parseV2RefKey,
  splitParentChildId
} from '@fastgpt/global/core/workflow/node/agent/promptRef/codec';
import {
  parseAgentPromptRefKey,
  parseLegacyRefKey,
  toLegacyToolLookup
} from '@fastgpt/global/core/workflow/node/agent/promptRef/legacy';
import {
  extractAgentPromptRefs,
  hasDebugPromptRef,
  stripAgentPromptRefs
} from '@fastgpt/global/core/workflow/node/agent/promptRef/text';
import { splitCombineToolId } from '@fastgpt/global/core/app/tool/utils';
import {
  isBuiltinPromptRefKey,
  refFromBuiltin,
  refFromSkill,
  refFromTool
} from '@fastgpt/global/core/workflow/node/agent/promptRef/adapters';
import { AgentPromptRefRegistry } from '@fastgpt/global/core/workflow/node/agent/promptRef/registry';
import { AgentSkillSourceEnum } from '@fastgpt/global/core/ai/skill/constants';

describe('agent promptRef V2 codec (parseV2RefKey / formatRefKey)', () => {
  it('parses and roundtrips all V2 ref kinds including complex childIds with : and /', () => {
    const cases = [
      'builtin:dataset_search',
      'builtin:read_files',
      'builtin:agent_sandbox',
      'builtin:future_memory',
      'plugin:system:metaso',
      'plugin:system:feishu/send_msg',
      'plugin:commercial:67c200000000000000000009',
      'plugin:team:67a100000000000000000001:metaso',
      'plugin:debug:67d300000000000000000002:local_calc',
      'skill:system:68b2000000000000000000aa',
      'skill:team:68b2000000000000000000bb',
      'app:team:66f100000000000000000011',
      'app:team:66f100000000000000000022/ns:get-issue',
      'app:team:66f100000000000000000022//api/v1/users'
    ];

    for (const key of cases) {
      const parsed = parseV2RefKey(key);
      expect(parsed).not.toBeNull();
      expect(formatRefKey(parsed!)).toBe(key);
      expect(parseV2RefKey(key)).not.toBeNull();
    }

    expect(splitParentChildId('66f1/ns:get-issue')).toEqual({
      parentId: '66f1',
      childId: 'ns:get-issue'
    });
    expect(splitParentChildId('66f1//api/v1/users')).toEqual({
      parentId: '66f1',
      childId: '/api/v1/users'
    });
  });

  it('rejects malformed or legacy keys in pure V2 parser', () => {
    const invalidKeys = [
      '',
      'dataset_search',
      'system:systemTool-metaso',
      'teamId:t1:systemTool-metaso',
      'plugin:unknown:metaso',
      'plugin:team:missing_id',
      'plugin:debug:only_owner',
      'skill:other:123',
      'app:system:123',
      'builtin:',
      'builtin:has@at'
    ];

    for (const key of invalidKeys) {
      expect(parseV2RefKey(key)).toBeNull();
    }
  });
});

describe('agent promptRef independent legacy parser (parseLegacyRefKey)', () => {
  it('deterministically parses all legacy prefixed formats', () => {
    expect(parseLegacyRefKey('dataset_search').deterministicRef).toEqual({
      type: 'builtin',
      id: 'dataset_search'
    });
    expect(parseLegacyRefKey('system:systemTool-metaso').deterministicRef).toEqual({
      type: 'plugin',
      source: 'system',
      id: 'metaso',
      parentId: 'metaso'
    });
    expect(parseLegacyRefKey('systemTool-metaso').deterministicRef).toEqual({
      type: 'plugin',
      source: 'system',
      id: 'metaso',
      parentId: 'metaso'
    });
    expect(parseLegacyRefKey('community-wiki').deterministicRef).toEqual({
      type: 'plugin',
      source: 'system',
      id: 'wiki',
      parentId: 'wiki'
    });
    expect(parseLegacyRefKey('commercial-dalle3').deterministicRef).toEqual({
      type: 'plugin',
      source: 'system',
      id: 'dalle3',
      parentId: 'dalle3'
    });
    expect(parseLegacyRefKey('commercial-67c200000000000000000009').deterministicRef).toEqual({
      type: 'plugin',
      source: 'commercial',
      id: '67c200000000000000000009',
      parentId: '67c200000000000000000009'
    });
    expect(
      parseLegacyRefKey('teamId:67a100000000000000000001:systemTool-metaso').deterministicRef
    ).toEqual({
      type: 'plugin',
      source: 'team',
      teamId: '67a100000000000000000001',
      id: 'metaso',
      parentId: 'metaso'
    });
    expect(
      parseLegacyRefKey('debug:tmbId:67d300000000000000000002:systemTool-calc').deterministicRef
    ).toEqual({
      type: 'plugin',
      source: 'debug',
      tmbId: '67d300000000000000000002',
      id: 'calc',
      parentId: 'calc'
    });
    expect(parseLegacyRefKey('personal-66f100000000000000000011').deterministicRef).toEqual({
      type: 'app',
      source: 'team',
      id: '66f100000000000000000011',
      parentId: '66f100000000000000000011'
    });
    expect(parseLegacyRefKey('mcp-66f100000000000000000022/ns:get-issue').deterministicRef).toEqual(
      {
        type: 'app',
        source: 'team',
        id: '66f100000000000000000022/ns:get-issue',
        parentId: '66f100000000000000000022',
        childId: 'ns:get-issue'
      }
    );
    expect(
      parseLegacyRefKey('http-66f100000000000000000022//api/v1/users').deterministicRef
    ).toEqual({
      type: 'app',
      source: 'team',
      id: '66f100000000000000000022//api/v1/users',
      parentId: '66f100000000000000000022',
      childId: '/api/v1/users'
    });
    expect(parseLegacyRefKey('66f100000000000000000011')).toEqual({
      kind: 'legacy',
      rawKey: '66f100000000000000000011',
      bareId: '66f100000000000000000011'
    });
  });

  it('roundtrips structured V2 refs back to legacy tool lookup params', () => {
    expect(toLegacyToolLookup(parseV2RefKey('plugin:system:metaso')!)).toEqual({
      appId: 'systemTool-metaso',
      source: 'system'
    });
    expect(
      toLegacyToolLookup(parseV2RefKey('plugin:commercial:67c200000000000000000009')!)
    ).toEqual({
      appId: 'commercial-67c200000000000000000009',
      source: 'system'
    });
    expect(
      toLegacyToolLookup(parseV2RefKey('plugin:team:67a100000000000000000001:metaso')!)
    ).toEqual({
      appId: 'systemTool-metaso',
      source: 'teamId:67a100000000000000000001'
    });
    expect(
      toLegacyToolLookup(parseV2RefKey('plugin:debug:67d300000000000000000002:calc')!)
    ).toEqual({
      appId: 'systemTool-calc',
      source: 'debug:tmbId:67d300000000000000000002'
    });
    expect(toLegacyToolLookup(parseV2RefKey('app:team:66f100000000000000000011')!)).toEqual({
      appId: '66f100000000000000000011'
    });
    expect(toLegacyToolLookup(parseV2RefKey('builtin:read_files')!)).toBeNull();
    expect(toLegacyToolLookup(parseV2RefKey('skill:team:68b2000000000000000000aa')!)).toBeNull();
  });
});

describe('AgentPromptRefRegistry invariants', () => {
  const createRegistry = () =>
    AgentPromptRefRegistry.create([
      {
        ref: refFromTool({ id: 'systemTool-metaso', source: 'system' })!,
        displayName: '秘塔搜索(官方)',
        meta: { tag: 'sys-metaso' }
      },
      {
        ref: refFromTool({
          id: 'systemTool-metaso',
          source: 'teamId:67a100000000000000000001'
        })!,
        displayName: '秘塔搜索(团队)',
        meta: { tag: 'team-metaso' }
      },
      // ToolSet 展开多个子工具共享同一父级 canonicalKey，不应触发假歧义
      {
        ref: refFromTool({ id: 'systemTool-feishu', source: 'system' })!,
        displayName: '飞书工具集',
        meta: { tag: 'feishu-1' }
      },
      {
        ref: refFromTool({ id: 'systemTool-feishu', source: 'system' })!,
        displayName: '飞书工具集',
        meta: { tag: 'feishu-2' }
      },
      {
        ref: refFromTool({ id: 'mcp-66f100000000000000000022/ns:get-issue' })!,
        displayName: 'GitHub查Issue',
        meta: { tag: 'gh-issue' }
      },
      {
        ref: refFromTool({ id: 'http-66f100000000000000000022//api/v1/users' })!,
        displayName: 'HTTP查用户',
        meta: { tag: 'http-users' }
      },
      {
        ref: refFromTool({
          id: 'systemTool-local_calc',
          source: 'debug:tmbId:67d300000000000000000002'
        })!,
        displayName: '本地计算器',
        meta: { tag: 'debug-calc' }
      },
      {
        ...refFromSkill({ skillId: '68b2000000000000000000aa' }),
        displayName: '旧快照技能',
        meta: { tag: 'legacy-skill' }
      },
      {
        ...refFromSkill({
          skillId: '68b2000000000000000000bb',
          source: AgentSkillSourceEnum.system
        }),
        displayName: '系统技能',
        meta: { tag: 'sys-skill' }
      },
      {
        ref: refFromBuiltin('dataset_search'),
        displayName: '知识库检索',
        meta: { tag: 'kb' }
      },
      {
        ref: refFromBuiltin('read_files'),
        displayName: '文件解析',
        meta: { tag: 'rf' }
      }
    ]);

  it('prevents cross-source bleed for V2 keys and trips circuit breaker on ambiguous bare keys', () => {
    const registry = createRegistry();

    const wrongTeam = registry.resolve('plugin:team:otherTeam:metaso');
    expect(wrongTeam.status).toBe('unresolved');

    const bareMetaso = registry.resolve('metaso');
    expect(bareMetaso.status).toBe('ambiguous');
    if (bareMetaso.status === 'ambiguous') {
      expect(bareMetaso.candidates.map((c) => c.canonicalKey)).toEqual([
        'plugin:system:metaso',
        'plugin:team:67a100000000000000000001:metaso'
      ]);
    }

    const feishu = registry.resolve('feishu');
    expect(feishu.status).toBe('resolved');
    if (feishu.status === 'resolved') {
      expect(feishu.entry.canonicalKey).toBe('plugin:system:feishu');
    }

    expect(registry.resolve('skill:system:68b2000000000000000000aa').status).toBe('resolved');
    expect(registry.resolve('skill:team:68b2000000000000000000aa').status).toBe('resolved');
    expect(registry.resolve('skill:team:68b2000000000000000000bb').status).toBe('unresolved');
    expect(registry.resolve('skill:system:68b2000000000000000000bb').status).toBe('resolved');
  });

  it('supports legacy 3-segment MCP fallback only within the same appId', () => {
    const registry = createRegistry();
    const sameApp = registry.resolve('mcp-66f100000000000000000022/githubSet/ns:get-issue');
    expect(sameApp.status).toBe('resolved');
    if (sameApp.status === 'resolved') {
      expect(sameApp.entry.displayName).toBe('GitHub查Issue');
    }

    const otherApp = registry.resolve('mcp-999900000000000000000099/githubSet/ns:get-issue');
    expect(otherApp.status).toBe('unresolved');
  });

  it('protects JSON 3-brace endings in renderForModel', () => {
    const registry = createRegistry();
    const input =
      'JSON: {"tool": {{@app:team:66f100000000000000000022/ns:get-issue@}}, "http": {{@app:team:66f100000000000000000022//api/v1/users@}}}\n' +
      'Refs: {{@builtin:read_files@}} + {{@dataset_search@}} + {{@metaso@}} + {{@builtin:future_cap@}}';

    const rendered = registry.renderForModel({ text: input });
    expect(rendered).toBe(
      'JSON: {"tool": {{GitHub查Issue}}, "http": {{HTTP查用户}}}\n' +
        'Refs: {{文件解析}} + {{知识库检索}} + {{@metaso@}} + {{@builtin:future_cap@}}'
    );
  });

  it('composes Pro prompts without double wrapping and strips non-ref switches', () => {
    const registry = createRegistry();
    const composed = registry.composePromptText({
      text: '用 @plugin:system:metaso 与 {{@plugin:system:feishu@}} 和 {{@builtin:read_files@}}，查 @kb_1，开启 @file_upload 与 @[sandbox]',
      mentions: [
        { rawId: 'plugin:system:metaso', targetKey: 'plugin:system:metaso' },
        { rawId: 'plugin:system:feishu', targetKey: 'plugin:system:feishu' },
        { rawId: 'kb_1', targetKey: 'builtin:dataset_search' }
      ]
    });

    expect(composed).toBe(
      '用 {{@plugin:system:metaso@}} 与 {{@plugin:system:feishu@}} 和 {{@builtin:read_files@}}，查 {{@builtin:dataset_search@}}，开启 file_upload 与 sandbox'
    );
    expect(composed).not.toContain('{{{{');
  });

  it('detects debug refs, stripping, and builtin predicates', () => {
    expect(hasDebugPromptRef('{{@debug:tmbId:u1:systemTool-x@}}')).toBe(true);
    expect(hasDebugPromptRef('{{@plugin:debug:u1:x@}}')).toBe(true);
    expect(hasDebugPromptRef('{{@plugin:system:x@}}')).toBe(false);
    expect(stripAgentPromptRefs('使用 {{@plugin:system:x@}} 和 {{$start.q$}}')).toBe(
      '使用  和 {{$start.q$}}'
    );
    expect(extractAgentPromptRefs('{{@builtin:dataset_search@}}')).toHaveLength(1);
    expect(isBuiltinPromptRefKey('builtin:read_files')).toBe(true);
    expect(isBuiltinPromptRefKey('read_files')).toBe(true);
    expect(isBuiltinPromptRefKey('plugin:system:metaso')).toBe(false);
    expect(parseAgentPromptRefKey('').kind).toBe('invalid');
  });

  it('prevents deleted legacy HTTP child paths from cross-binding to another tool sharing the last segment', () => {
    const httpAppId = '66f100000000000000000055';
    const registry = AgentPromptRefRegistry.create([
      {
        ref: {
          type: 'app',
          source: 'team',
          id: `${httpAppId}/users`,
          parentId: httpAppId,
          childId: 'users'
        },
        displayName: 'Users Tool',
        meta: { label: 'users' }
      }
    ]);

    expect(registry.resolve(`http-${httpAppId}//api/v1/users`).status).toBe('unresolved');
    expect(registry.resolve(`app:team:${httpAppId}//api/v1/users`).status).toBe('unresolved');
    expect(registry.resolve(`mcp-${httpAppId}/LegacyToolset/users`)).toMatchObject({
      status: 'resolved',
      matchedBy: 'deterministic_legacy',
      entry: { displayName: 'Users Tool' }
    });
  });

  it('parses untyped V2 child tool lookup ids in splitCombineToolId', () => {
    const parentId = '66f100000000000000000088';
    expect(splitCombineToolId(`${parentId}/get-weather`)).toEqual({
      source: 'personal',
      pluginId: `${parentId}/get-weather`,
      authAppId: parentId
    });
    expect(splitCombineToolId(`${parentId}//api/v1/users`)).toEqual({
      source: 'personal',
      pluginId: `${parentId}//api/v1/users`,
      authAppId: parentId
    });
  });
});
