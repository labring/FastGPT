export type KnownBuiltinPromptRefId = 'dataset_search' | 'read_files' | 'agent_sandbox';

/**
 * Agent 提示词引用 V2 判别联合模型。
 * - builtin.id 保持开放 string 以保证跨版本前向兼容；业务侧通过 KnownBuiltinPromptRefId 约束已知目录。
 * - plugin.id 恒存纯净 pluginId（不含 systemTool- / commercial- 等历史前缀）。
 */
export type AgentPromptRef =
  | { type: 'builtin'; id: string }
  | { type: 'plugin'; source: 'system'; id: string; parentId: string; childId?: string }
  | { type: 'plugin'; source: 'commercial'; id: string; parentId: string; childId?: string }
  | {
      type: 'plugin';
      source: 'team';
      teamId: string;
      id: string;
      parentId: string;
      childId?: string;
    }
  | {
      type: 'plugin';
      source: 'debug';
      tmbId: string;
      id: string;
      parentId: string;
      childId?: string;
    }
  | { type: 'skill'; source: 'system' | 'team'; id: string }
  | { type: 'app'; source: 'team'; id: string; parentId: string; childId?: string };

export type ParsedLegacyPromptRef = {
  kind: 'legacy';
  rawKey: string;
  /** 可无状态确定还原的旧格式（如 system:systemTool-x、teamId:tid:x、dataset_search、personal-id） */
  deterministicRef?: AgentPromptRef;
  /** 需目录消歧的裸键（如裸 24 位 ObjectId、极老裸插件名） */
  bareId?: string;
};

export type ParsedAgentPromptRef =
  | { kind: 'v2'; ref: AgentPromptRef; canonicalKey: string }
  | ParsedLegacyPromptRef
  | { kind: 'invalid'; rawKey: string; reason: string };

export type AgentPromptRefWriteMode = 'legacy' | 'v2';

/** 默认写态协议：切为 V2，按需可回退为 legacy 实现灰度切换。 */
export const DEFAULT_AGENT_PROMPT_REF_WRITE_MODE: AgentPromptRefWriteMode = 'v2';

export type AgentPromptRefEntry<TMeta = unknown> = {
  ref: AgentPromptRef;
  canonicalKey?: string;
  displayName: string;
  /** 写态回退 legacy 时的兼容键；切换 V2 后仅用于回滚兜底。 */
  legacyWriteKey?: string;
  /** 历史 Skill 快照缺少 source 时标记为 true，允许按全局唯一 ObjectId 跨 system/team 命中。 */
  sourceInferred?: boolean;
  /** 额外历史裸键或旧三段式候选键。 */
  extraLegacyKeys?: string[];
  meta: TMeta;
};

export type NormalizedAgentPromptRefEntry<TMeta = unknown> = Omit<
  AgentPromptRefEntry<TMeta>,
  'canonicalKey'
> & {
  canonicalKey: string;
};

export type ResolvePromptRefMatchedBy = 'canonical' | 'deterministic_legacy' | 'legacy_lookup';

export type ResolvePromptRefResult<TMeta = unknown> =
  | {
      status: 'resolved';
      entry: NormalizedAgentPromptRefEntry<TMeta>;
      matchedBy: ResolvePromptRefMatchedBy;
    }
  | {
      status: 'ambiguous';
      rawKey: string;
      candidates: NormalizedAgentPromptRefEntry<TMeta>[];
    }
  | {
      status: 'unresolved';
      rawKey: string;
      parsed: ParsedAgentPromptRef;
    };

export type PromptRefDiagnosticEvent<TMeta = unknown> =
  | {
      type: 'legacy_hit';
      rawKey: string;
      canonicalKey: string;
      matchedBy: 'deterministic_legacy' | 'legacy_lookup';
    }
  | {
      type: 'ambiguous';
      rawKey: string;
      candidates: NormalizedAgentPromptRefEntry<TMeta>[];
    }
  | {
      type: 'unresolved';
      rawKey: string;
      parsed: ParsedAgentPromptRef;
    };

export type PromptRefAuditResult = {
  debugRefs: string[];
  legacyRefs: string[];
  ambiguousRefs: Array<{ rawKey: string; candidates: string[] }>;
  unresolvedRefs: Array<{ rawKey: string; inferredType?: AgentPromptRef['type'] }>;
};
