import { formatRefKey, parseV2RefKey } from './codec';
import { deriveBareLegacyKeys, parseAgentPromptRefKey, parseLegacyRefKey } from './legacy';
import { AGENT_PROMPT_REF_REGEXP, formatPromptRefToken, normalizeDoubleWrappedRefs } from './text';
import {
  DEFAULT_AGENT_PROMPT_REF_WRITE_MODE,
  type AgentPromptRef,
  type AgentPromptRefEntry,
  type AgentPromptRefWriteMode,
  type NormalizedAgentPromptRefEntry,
  type ParsedLegacyPromptRef,
  type PromptRefAuditResult,
  type PromptRefDiagnosticEvent,
  type ResolvePromptRefResult
} from './types';

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * 前后端同构的 Agent 提示词引用不可变注册表。
 * - 构造期一次性建立 canonicalMap / legacyMap / ambiguousMap，运行期查询 O(1) 无副作用；
 * - 严格分离 resolveV2 与 resolveLegacy，避免新旧解析耦合与跨来源串源。
 */
export class AgentPromptRefRegistry<TMeta = unknown> {
  private readonly canonicalMap = new Map<string, NormalizedAgentPromptRefEntry<TMeta>>();
  private readonly legacyMap = new Map<string, NormalizedAgentPromptRefEntry<TMeta>>();
  private readonly ambiguousMap = new Map<string, NormalizedAgentPromptRefEntry<TMeta>[]>();
  private readonly inferredSkillIdMap = new Map<string, NormalizedAgentPromptRefEntry<TMeta>>();
  private readonly orderedEntries: NormalizedAgentPromptRefEntry<TMeta>[] = [];

  private constructor(entries: AgentPromptRefEntry<TMeta>[]) {
    for (const entry of entries) {
      const canonicalKey = entry.canonicalKey ?? formatRefKey(entry.ref);
      const normalized: NormalizedAgentPromptRefEntry<TMeta> = {
        ...entry,
        canonicalKey
      };

      if (!this.canonicalMap.has(canonicalKey)) {
        this.canonicalMap.set(canonicalKey, normalized);
        this.orderedEntries.push(normalized);
      }

      if (entry.ref.type === 'skill' && entry.sourceInferred) {
        this.inferredSkillIdMap.set(entry.ref.id, normalized);
      }

      const bareKeys = [...deriveBareLegacyKeys(entry.ref), ...(entry.extraLegacyKeys ?? [])];
      for (const bareKey of bareKeys) {
        if (!bareKey) continue;

        const existingAmbiguous = this.ambiguousMap.get(bareKey);
        if (existingAmbiguous) {
          if (!existingAmbiguous.some((item) => item.canonicalKey === canonicalKey)) {
            existingAmbiguous.push(normalized);
          }
          continue;
        }

        const existing = this.legacyMap.get(bareKey);
        if (!existing) {
          this.legacyMap.set(bareKey, normalized);
          continue;
        }

        // ToolSet 展开多个子工具共享同一父级 canonicalKey 时视作同一引用，不触发假歧义。
        if (existing.canonicalKey !== canonicalKey) {
          this.legacyMap.delete(bareKey);
          this.ambiguousMap.set(bareKey, [existing, normalized]);
        }
      }
    }
  }

  static create<TMeta = unknown>(
    entries: AgentPromptRefEntry<TMeta>[]
  ): AgentPromptRefRegistry<TMeta> {
    return new AgentPromptRefRegistry(entries);
  }

  /** 返回去重后的全部规范化条目快照。 */
  entries(): NormalizedAgentPromptRefEntry<TMeta>[] {
    return this.orderedEntries;
  }

  /** 按 canonicalKey 精确获取条目。 */
  getByCanonicalKey(canonicalKey: string): NormalizedAgentPromptRefEntry<TMeta> | undefined {
    return this.canonicalMap.get(canonicalKey);
  }

  /** 纯 V2 查表：只查 canonicalMap（+无 source 旧 Skill 兜底），严禁降级查 legacyMap 防串源。 */
  resolveV2(ref: AgentPromptRef, rawKey?: string): ResolvePromptRefResult<TMeta> {
    const canonicalKey = formatRefKey(ref);
    const hit = this.canonicalMap.get(canonicalKey);
    if (hit) {
      return { status: 'resolved', entry: hit, matchedBy: 'canonical' };
    }

    if (ref.type === 'skill') {
      const inferred = this.inferredSkillIdMap.get(ref.id);
      if (inferred) {
        return { status: 'resolved', entry: inferred, matchedBy: 'canonical' };
      }
    }

    return {
      status: 'unresolved',
      rawKey: rawKey ?? canonicalKey,
      parsed: { kind: 'v2', ref, canonicalKey }
    };
  }

  /** 纯旧格式查表：先处理确定性旧键（含同 App 三段式末段回退），再查冲突熔断表与裸键表。 */
  resolveLegacy(parsed: ParsedLegacyPromptRef): ResolvePromptRefResult<TMeta> {
    if (parsed.deterministicRef) {
      const canonicalKey = formatRefKey(parsed.deterministicRef);
      const hit = this.canonicalMap.get(canonicalKey);
      if (hit) {
        return { status: 'resolved', entry: hit, matchedBy: 'deterministic_legacy' };
      }

      // 兼容旧三段式 mcp-appId/toolsetName/toolName：仅在同 appId 下回退最后一段。
      if (
        parsed.deterministicRef.type === 'app' &&
        parsed.deterministicRef.childId &&
        parsed.deterministicRef.childId.includes('/')
      ) {
        const lastSegment = parsed.deterministicRef.childId.split('/').at(-1);
        if (lastSegment) {
          const fallbackKey = `app:team:${parsed.deterministicRef.parentId}/${lastSegment}`;
          const fallbackHit = this.canonicalMap.get(fallbackKey);
          if (fallbackHit) {
            return { status: 'resolved', entry: fallbackHit, matchedBy: 'deterministic_legacy' };
          }
        }
      }

      return { status: 'unresolved', rawKey: parsed.rawKey, parsed };
    }

    if (parsed.bareId) {
      const ambiguousCandidates = this.ambiguousMap.get(parsed.bareId);
      if (ambiguousCandidates) {
        return {
          status: 'ambiguous',
          rawKey: parsed.bareId,
          candidates: ambiguousCandidates
        };
      }

      const hit = this.legacyMap.get(parsed.bareId);
      if (hit) {
        return { status: 'resolved', entry: hit, matchedBy: 'legacy_lookup' };
      }
    }

    return { status: 'unresolved', rawKey: parsed.rawKey, parsed };
  }

  /** 统一薄路由入口：先走纯 V2 解析与查表，未命中 V2 语法再走独立旧链路。 */
  resolve(rawKey: string): ResolvePromptRefResult<TMeta> {
    const trimmed = rawKey.trim();
    if (!trimmed) {
      return {
        status: 'unresolved',
        rawKey: trimmed,
        parsed: { kind: 'invalid', rawKey: trimmed, reason: 'empty' }
      };
    }

    const v2Ref = parseV2RefKey(trimmed);
    if (v2Ref) {
      return this.resolveV2(v2Ref, trimmed);
    }

    return this.resolveLegacy(parseLegacyRefKey(trimmed));
  }

  /** 按当前灰度模式返回写态键（V2 返回 canonicalKey，legacy 优先返回 legacyWriteKey）。 */
  getWriteKey({
    canonicalKey,
    mode = DEFAULT_AGENT_PROMPT_REF_WRITE_MODE
  }: {
    canonicalKey: string;
    mode?: AgentPromptRefWriteMode;
  }): string {
    const entry = this.canonicalMap.get(canonicalKey);
    if (!entry) return canonicalKey;
    if (mode === 'legacy' && entry.legacyWriteKey) {
      return entry.legacyWriteKey;
    }
    return entry.canonicalKey;
  }

  /** 后端运行时渲染：折叠成对双括号 → 逐个结构化解析 → 替换为模型可读的 `{{displayName}}`。 */
  renderForModel({
    text,
    formatResolved,
    onDiagnostic
  }: {
    text: string;
    formatResolved?: (entry: NormalizedAgentPromptRefEntry<TMeta>, raw: string) => string;
    onDiagnostic?: (event: PromptRefDiagnosticEvent<TMeta>) => void;
  }): string {
    if (!text) return text;

    const normalized = normalizeDoubleWrappedRefs(text);
    return normalized.replace(AGENT_PROMPT_REF_REGEXP, (raw, innerKey: string) => {
      const result = this.resolve(innerKey);
      if (result.status === 'resolved') {
        if (result.matchedBy !== 'canonical') {
          onDiagnostic?.({
            type: 'legacy_hit',
            rawKey: innerKey.trim(),
            canonicalKey: result.entry.canonicalKey,
            matchedBy: result.matchedBy
          });
        }
        return formatResolved
          ? formatResolved(result.entry, raw)
          : `{{${result.entry.displayName}}}`;
      }

      if (result.status === 'ambiguous') {
        onDiagnostic?.({
          type: 'ambiguous',
          rawKey: result.rawKey,
          candidates: result.candidates
        });
        return raw;
      }

      onDiagnostic?.({
        type: 'unresolved',
        rawKey: result.rawKey,
        parsed: result.parsed
      });
      return raw;
    });
  }

  /**
   * 后端（Pro 辅助生成）安全拼接：将计划中的 `@id` / `@[id]` / `@id@` / `{{@id@}}` / `{{{{@id@}}}}`
   * 一次性单层规范化为 `{{@<targetKey>@}}`，彻底杜绝二次包裹。
   */
  composePromptText({
    text,
    mentions,
    stripNonRefMentions = ['file_upload', 'sandbox']
  }: {
    text: string;
    mentions: Array<{ rawId: string; targetKey: string }>;
    stripNonRefMentions?: string[];
  }): string {
    if (!text) return text;

    let output = normalizeDoubleWrappedRefs(text);

    // 按 rawId 长度降序处理，防止短 ID 误截断包含相同前缀的长 ID。
    const sortedMentions = [...mentions]
      .filter((item) => item.rawId.trim().length > 0 && item.targetKey.trim().length > 0)
      .sort((a, b) => b.rawId.length - a.rawId.length);

    for (const mention of sortedMentions) {
      const rawId = mention.rawId.trim();
      const resolvedTarget = this.resolve(mention.targetKey);
      const finalKey =
        resolvedTarget.status === 'resolved'
          ? resolvedTarget.entry.canonicalKey
          : mention.targetKey.trim();
      const escapedId = escapeRegExp(rawId);
      // 同一正则同时吞掉已带 {{@...@}} 和裸 @id / @[id] / @id@，保证永远只包裹一层。
      const mentionRegex = new RegExp(
        `\\{\\{@${escapedId}@\\}\\}|@\\[${escapedId}\\]|@${escapedId}@?(?![A-Za-z0-9_:\\/-])`,
        'g'
      );
      output = output.replace(mentionRegex, formatPromptRefToken(finalKey));
    }

    if (stripNonRefMentions.length > 0) {
      const namesPattern = stripNonRefMentions.map(escapeRegExp).join('|');
      const nonRefRegex = new RegExp(
        `(?<!\\{\\{)@(?:\\[(${namesPattern})\\]|(${namesPattern})@?(?![A-Za-z0-9_:\\/-]))(?!\\}\\})`,
        'g'
      );
      output = output.replace(nonRefRegex, (_match, bracketed?: string, plain?: string) => {
        return bracketed ?? plain ?? '';
      });
    }

    return normalizeDoubleWrappedRefs(output);
  }

  /** 存量提示词无损升级：仅升级唯一命中的旧引用（及双括号修复），未命中或歧义保持原样。 */
  upgradePrompt(text: string): { text: string; upgradedCount: number } {
    if (!text) return { text, upgradedCount: 0 };

    const normalized = normalizeDoubleWrappedRefs(text);
    let upgradedCount = 0;

    const upgraded = normalized.replace(AGENT_PROMPT_REF_REGEXP, (raw, innerKey: string) => {
      const result = this.resolve(innerKey);
      if (result.status !== 'resolved') return raw;

      const nextToken = formatPromptRefToken(result.entry.canonicalKey);
      if (nextToken !== raw) {
        upgradedCount += 1;
      }
      return nextToken;
    });

    return {
      text: upgraded,
      upgradedCount
    };
  }

  /** 发布校验与观测审计：一次性检出 debug 引用、旧格式命中、歧义引用与未解析引用。 */
  auditPrompt(text: string): PromptRefAuditResult {
    const debugRefs: string[] = [];
    const legacyRefs: string[] = [];
    const ambiguousRefs: Array<{ rawKey: string; candidates: string[] }> = [];
    const unresolvedRefs: Array<{ rawKey: string; inferredType?: AgentPromptRef['type'] }> = [];

    if (!text) {
      return { debugRefs, legacyRefs, ambiguousRefs, unresolvedRefs };
    }

    const normalized = normalizeDoubleWrappedRefs(text);
    for (const match of normalized.matchAll(AGENT_PROMPT_REF_REGEXP)) {
      const rawKey = match[1].trim();
      const parsed = parseAgentPromptRefKey(rawKey);
      const parsedRef =
        parsed.kind === 'v2'
          ? parsed.ref
          : parsed.kind === 'legacy'
            ? parsed.deterministicRef
            : undefined;

      if (parsedRef?.type === 'plugin' && parsedRef.source === 'debug') {
        debugRefs.push(rawKey);
      }

      const result = this.resolve(rawKey);
      if (result.status === 'resolved') {
        if (result.entry.ref.type === 'plugin' && result.entry.ref.source === 'debug') {
          if (!debugRefs.includes(rawKey)) debugRefs.push(rawKey);
        }
        if (result.matchedBy !== 'canonical') {
          legacyRefs.push(rawKey);
        }
      } else if (result.status === 'ambiguous') {
        ambiguousRefs.push({
          rawKey: result.rawKey,
          candidates: result.candidates.map((item) => item.canonicalKey)
        });
      } else {
        unresolvedRefs.push({
          rawKey: result.rawKey,
          inferredType: parsedRef?.type
        });
      }
    }

    return { debugRefs, legacyRefs, ambiguousRefs, unresolvedRefs };
  }
}
