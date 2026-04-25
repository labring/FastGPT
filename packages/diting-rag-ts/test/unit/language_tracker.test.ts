// test/unit/language_tracker.test.ts
// v2 API: buildLanguageConfig + LanguageTracker with anomaly detection
import { describe, it, expect } from 'vitest';
import {
  LanguageTracker,
  buildLanguageConfig,
  type LanguageTrackerConfig
} from '../../src/utils/lang_directive';
import type { ChunkItem } from '../../src/types/chunk';

function makeChunk(overrides: Partial<ChunkItem> = {}): ChunkItem {
  return {
    id: 'c1',
    content: 'test',
    score: 0.5,
    datasetId: 'd1',
    sourceName: 'test',
    ...overrides
  };
}

// ============================================================
// buildLanguageConfig
// ============================================================

describe('buildLanguageConfig', () => {
  it('L1 authoritative: dominant >70%', () => {
    const { directive, trackerConfig } = buildLanguageConfig({ zh: 150, en: 30 }, 'en');
    expect(trackerConfig.confidence).toBe('authoritative');
    expect(trackerConfig.defaultLang).toBe('zh');
    expect(trackerConfig.userLang).toBe('en');
    expect(directive).toContain('DEFAULT SEARCH LANGUAGE: zh');
    expect(directive).toContain('83% zh');
    expect(directive).toContain('Final answer MUST be in: en');
  });

  it('L2 tentative: no language >70%', () => {
    const { directive, trackerConfig } = buildLanguageConfig({ zh: 60, en: 40, ja: 30 }, 'zh');
    expect(trackerConfig.confidence).toBe('tentative');
    expect(trackerConfig.defaultLang).toBe('zh');
    expect(directive).toContain('Monitor results');
  });

  it('L3 fallback: null stats', () => {
    const { directive, trackerConfig } = buildLanguageConfig(null, 'ja');
    expect(trackerConfig.confidence).toBe('fallback');
    expect(trackerConfig.defaultLang).toBe('ja');
    expect(directive).toContain('No KB language data');
    expect(directive).toContain('Start with user language (ja)');
  });

  it('L3 fallback: undefined stats', () => {
    const { trackerConfig } = buildLanguageConfig(undefined, 'ko');
    expect(trackerConfig.confidence).toBe('fallback');
  });

  it('L3 fallback: empty stats', () => {
    const { trackerConfig } = buildLanguageConfig({}, 'en');
    expect(trackerConfig.confidence).toBe('fallback');
  });

  it('handles single language (100% authoritative)', () => {
    const { trackerConfig, directive } = buildLanguageConfig({ en: 200 }, 'zh');
    expect(trackerConfig.confidence).toBe('authoritative');
    expect(trackerConfig.defaultLang).toBe('en');
    expect(directive).toContain('DEFAULT SEARCH LANGUAGE: en');
  });

  it('exact 70% threshold is tentative (not authoritative)', () => {
    const { trackerConfig } = buildLanguageConfig({ zh: 70, en: 30 }, 'en');
    expect(trackerConfig.confidence).toBe('tentative');
  });

  it('70.1% is authoritative', () => {
    const { trackerConfig } = buildLanguageConfig({ zh: 71, en: 29 }, 'en');
    expect(trackerConfig.confidence).toBe('authoritative');
  });

  it('L1 includes userHint when dominantLang differs from userLang', () => {
    const { directive } = buildLanguageConfig({ th: 150, en: 30 }, 'en');
    expect(directive).toContain('User asked in: en');
    expect(directive).toContain('try en queries');
  });

  it('L1 omits userHint when dominantLang equals userLang', () => {
    const { directive } = buildLanguageConfig({ en: 150, zh: 30 }, 'en');
    expect(directive).not.toContain('User asked in');
  });

  it('L2 includes userHint when dominantLang differs from userLang', () => {
    const { directive } = buildLanguageConfig({ zh: 60, en: 40, ja: 30 }, 'en');
    expect(directive).toContain('User asked in: en');
    expect(directive).toContain('try en queries');
  });

  it('L2 omits userHint when dominantLang equals userLang', () => {
    const { directive } = buildLanguageConfig({ zh: 60, en: 40, ja: 30 }, 'zh');
    expect(directive).not.toContain('User asked in');
  });
});

// ============================================================
// LanguageTracker
// ============================================================

describe('LanguageTracker', () => {
  const config: LanguageTrackerConfig = {
    defaultLang: 'zh',
    userLang: 'en',
    confidence: 'tentative'
  };

  describe('fromConfig', () => {
    it('creates tracker from LanguageTrackerConfig', () => {
      const t = LanguageTracker.fromConfig(config);
      expect(t.defaultLang).toBe('zh');
      expect(t.userLang).toBe('en');
      expect(t.confidence).toBe('tentative');
    });
  });

  describe('recordSearch', () => {
    it('records query language and result language distribution', () => {
      const t = LanguageTracker.fromConfig(config);
      const chunks = [
        makeChunk({ id: '1', detectedLanguage: 'zh' }),
        makeChunk({ id: '2', detectedLanguage: 'zh' }),
        makeChunk({ id: '3', detectedLanguage: 'en' })
      ];
      t.recordSearch('产品配置', chunks);
      expect(t.getLastRecord()).toBeDefined();
    });

    it('treats chunks without detectedLanguage as unknown', () => {
      const t = LanguageTracker.fromConfig(config);
      const chunks = [makeChunk({ id: '1' })];
      t.recordSearch('test', chunks);
      const rec = t.getLastRecord()!;
      expect(rec.resultStats['unknown']).toBe(1);
    });
  });

  describe('buildGuidance — normal (silence)', () => {
    it('returns null guidance when no records', () => {
      const t = LanguageTracker.fromConfig(config);
      const result = t.buildGuidance([]);
      expect(result.shouldPush).toBe(false);
      expect(result.guidance).toBeNull();
    });

    it('returns null when queryLang matches result dominant', () => {
      const t = LanguageTracker.fromConfig(config);
      t.recordSearch('系统配置', [
        makeChunk({ id: '1', detectedLanguage: 'zh' }),
        makeChunk({ id: '2', detectedLanguage: 'zh' }),
        makeChunk({ id: '3', detectedLanguage: 'en' })
      ]);
      // zh query → zh dominant → 正常
      const result = t.buildGuidance([
        makeChunk({ id: '1', score: 0.5 }) // 低相关，但语言匹配，不异常
      ]);
      expect(result.shouldPush).toBe(false);
    });

    it('returns null when result dominant matches defaultLang', () => {
      const t = LanguageTracker.fromConfig(config);
      t.recordSearch('how do I configure the API settings for this application', [
        makeChunk({ id: '1', detectedLanguage: 'zh' }),
        makeChunk({ id: '2', detectedLanguage: 'zh' })
      ]);
      // en query → zh dominant = defaultLang → 正常（用户用自己的语言搜索，结果是默认语言）
      const result = t.buildGuidance([]);
      expect(result.shouldPush).toBe(false);
    });
  });

  describe('buildGuidance — anomaly detection', () => {
    it('detects language mismatch with low relevance', () => {
      const jaConfig: LanguageTrackerConfig = {
        defaultLang: 'ja',
        userLang: 'zh',
        confidence: 'authoritative'
      };
      const t = LanguageTracker.fromConfig(jaConfig);
      t.recordSearch('API认证配置', [
        makeChunk({ id: '1', detectedLanguage: 'en' }),
        makeChunk({ id: '2', detectedLanguage: 'en' }),
        makeChunk({ id: '3', detectedLanguage: 'en' })
      ]);
      // zh query → en dominant ≠ ja default → 异常
      // filtered chunks have low score → 确认异常
      const result = t.buildGuidance([makeChunk({ id: '1', score: 0.1 })]);
      expect(result.shouldPush).toBe(true);
      expect(result.suppressEarlyStop).toBe(true);
      expect(result.guidance).toContain('⚠ LANGUAGE');
      expect(result.guidance).toContain('en');
    });

    it('suppresses anomaly when cross-lingual embedding gives high scores', () => {
      const jaConfig: LanguageTrackerConfig = {
        defaultLang: 'ja',
        userLang: 'zh',
        confidence: 'authoritative'
      };
      const t = LanguageTracker.fromConfig(jaConfig);
      t.recordSearch('API', [
        makeChunk({ id: '1', detectedLanguage: 'en' }),
        makeChunk({ id: '2', detectedLanguage: 'en' })
      ]);
      // zh query → en dominant ≠ ja default
      // BUT filtered chunks have high BGE → 跨语言生效，沉默
      const result = t.buildGuidance([makeChunk({ id: '1', score: 0.4, rerankScore: 0.5 })]);
      expect(result.shouldPush).toBe(false);
      expect(result.suppressEarlyStop).toBe(false);
    });

    it('deduplicates same anomaly', () => {
      const t = LanguageTracker.fromConfig({
        defaultLang: 'ja',
        userLang: 'zh',
        confidence: 'authoritative'
      });
      t.recordSearch('测试', [
        makeChunk({ id: '1', detectedLanguage: 'en' }),
        makeChunk({ id: '2', detectedLanguage: 'en' })
      ]);
      // First call → push
      const r1 = t.buildGuidance([makeChunk({ id: '1', score: 0.1 })]);
      expect(r1.shouldPush).toBe(true);

      // Second call with same anomaly → dedup
      const r2 = t.buildGuidance([makeChunk({ id: '1', score: 0.1 })]);
      expect(r2.shouldPush).toBe(false);
      expect(r2.suppressEarlyStop).toBe(true); // still suppress
    });

    it('clears anomaly after clearAnomaly()', () => {
      const t = LanguageTracker.fromConfig({
        defaultLang: 'ja',
        userLang: 'zh',
        confidence: 'authoritative'
      });
      t.recordSearch('测试', [
        makeChunk({ id: '1', detectedLanguage: 'en' }),
        makeChunk({ id: '2', detectedLanguage: 'en' })
      ]);
      t.buildGuidance([makeChunk({ id: '1', score: 0.1 })]); // push

      t.clearAnomaly();
      const r2 = t.buildGuidance([makeChunk({ id: '1', score: 0.1 })]);
      expect(r2.shouldPush).toBe(true); // re-pushes after clear
    });
  });

  describe('buildGuidance — LLM score cross-lingual bypass', () => {
    it('bypasses when LLM sub_query_score is high', () => {
      const t = LanguageTracker.fromConfig({
        defaultLang: 'ja',
        userLang: 'zh',
        confidence: 'authoritative'
      });
      t.recordSearch('测试', [
        makeChunk({ id: '1', detectedLanguage: 'en' }),
        makeChunk({ id: '2', detectedLanguage: 'en' })
      ]);
      // High LLM score → cross-lingual effective
      const result = t.buildGuidance([makeChunk({ id: '1', score: 0.1, llm_sub_query_score: 8 })]);
      expect(result.shouldPush).toBe(false);
    });
  });

  describe('buildGuidance — user language disconnect', () => {
    it('pushes guidance when searching in non-user language with weak results', () => {
      // 模拟用户用英文提问，但 KB 以泰文为主，Agent 一直在搜索泰文
      const t = LanguageTracker.fromConfig({
        defaultLang: 'th',
        userLang: 'en',
        confidence: 'authoritative'
      });
      // Agent 用泰文搜索，返回泰文结果
      t.recordSearch('ผู้เขียนหนังสือสามก๊ก', [
        makeChunk({ id: '1', detectedLanguage: 'th' }),
        makeChunk({ id: '2', detectedLanguage: 'th' })
      ]);
      // 结果相关性低
      const result = t.buildGuidance([makeChunk({ id: '1', score: 0.1 })]);
      expect(result.shouldPush).toBe(true);
      expect(result.guidance).toContain('⚠ LANGUAGE');
      expect(result.guidance).toContain('en');
      expect(result.guidance).toContain('th');
      expect(result.suppressEarlyStop).toBe(false);
    });

    it('silent when searching in non-user language but results are strong', () => {
      const t = LanguageTracker.fromConfig({
        defaultLang: 'th',
        userLang: 'en',
        confidence: 'authoritative'
      });
      t.recordSearch('ผู้เขียนหนังสือสามก๊ก', [
        makeChunk({ id: '1', detectedLanguage: 'th' }),
        makeChunk({ id: '2', detectedLanguage: 'th' })
      ]);
      // 高分结果 → 不推送，让 Agent 继续
      const result = t.buildGuidance([makeChunk({ id: '1', score: 0.8 })]);
      expect(result.shouldPush).toBe(false);
    });

    it('silent when queryLang matches userLang (user language is being used)', () => {
      const t = LanguageTracker.fromConfig({
        defaultLang: 'th',
        userLang: 'en',
        confidence: 'authoritative'
      });
      // 用户用英文搜索
      t.recordSearch('author of Three Kingdoms', [
        makeChunk({ id: '1', detectedLanguage: 'th' }),
        makeChunk({ id: '2', detectedLanguage: 'th' })
      ]);
      // queryLang='en' === userLang='en' → 已在尝试用户语言
      const result = t.buildGuidance([makeChunk({ id: '1', score: 0.1 })]);
      expect(result.shouldPush).toBe(false);
    });

    it('deduplicates user-lang guidance', () => {
      const t = LanguageTracker.fromConfig({
        defaultLang: 'th',
        userLang: 'en',
        confidence: 'authoritative'
      });
      t.recordSearch('ผู้เขียนหนังสือสามก๊ก', [makeChunk({ id: '1', detectedLanguage: 'th' })]);
      // 第一次 → push
      const r1 = t.buildGuidance([makeChunk({ id: '1', score: 0.1 })]);
      expect(r1.shouldPush).toBe(true);

      // 第二次相同情况 → dedup
      t.recordSearch('ประวัติสามก๊ก', [makeChunk({ id: '2', detectedLanguage: 'th' })]);
      const r2 = t.buildGuidance([makeChunk({ id: '2', score: 0.1 })]);
      expect(r2.shouldPush).toBe(false);
    });

    it('silent when defaultLang equals userLang (no disconnect possible)', () => {
      const t = LanguageTracker.fromConfig({
        defaultLang: 'zh',
        userLang: 'zh',
        confidence: 'authoritative'
      });
      t.recordSearch('系统配置', [makeChunk({ id: '1', detectedLanguage: 'zh' })]);
      const result = t.buildGuidance([makeChunk({ id: '1', score: 0.1 })]);
      expect(result.shouldPush).toBe(false);
    });
  });
});
