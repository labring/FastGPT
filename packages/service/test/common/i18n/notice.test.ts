import { describe, expect, it } from 'vitest';
import { generatedLoaders } from '@fastgpt/web/i18n/resourceLoaders.generated';
import enChat from '@fastgpt/web/i18n/en/chat.json';
import zhCNChat from '@fastgpt/web/i18n/zh-CN/chat.json';
import zhHantChat from '@fastgpt/web/i18n/zh-Hant/chat.json';
import koKRChat from '@fastgpt/web/i18n/ko-KR/chat.json';
import { createApiI18n } from '@fastgpt/service/common/i18n/request';
import {
  AGENT_RUN_FAILED_FALLBACK_I18N_KEY,
  AGENT_RUN_FAILED_NOTICE_I18N_KEY,
  APP_RUN_FAILED_NOTICE_I18N_KEY,
  resolveAgentRunFailedFallback,
  resolveAgentRunFailedNotice,
  resolveAppRunFailedNotice,
  resolveStaticNoticeText
} from '@fastgpt/service/common/i18n/notice';
import type { NodeApiRequest, NodeApiResponse } from '@fastgpt/service/types/http';

const withI18n = createApiI18n(generatedLoaders);

/** 构造只承载请求语言的 HTTP 边界；res 用于绑定异步回调的翻译上下文。 */
const httpObjects = (locale: string) => {
  const req = { headers: { 'x-fastgpt-language': locale } } as NodeApiRequest;
  const res = {} as NodeApiResponse;
  return { req, res };
};

const KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_]*:/;

describe('static notice i18n keys', () => {
  it('keeps the i18nT-wrapped declarations as plain `ns:key` strings', () => {
    // `i18nT` 只是声明标记（返回原 key），包装后解析入口拿到的仍是完整 key。
    expect(AGENT_RUN_FAILED_NOTICE_I18N_KEY).toBe('chat:agent_run_failed_notice');
    expect(AGENT_RUN_FAILED_FALLBACK_I18N_KEY).toBe('chat:agent_run_failed_fallback');
    expect(APP_RUN_FAILED_NOTICE_I18N_KEY).toBe('chat:app_run_failed_notice');
    for (const key of [
      AGENT_RUN_FAILED_NOTICE_I18N_KEY,
      AGENT_RUN_FAILED_FALLBACK_I18N_KEY,
      APP_RUN_FAILED_NOTICE_I18N_KEY
    ]) {
      expect(key).toMatch(KEY_PATTERN);
    }
  });

  it.each([
    ['zh-CN', zhCNChat.app_run_failed_notice],
    ['en', enChat.app_run_failed_notice],
    ['zh-Hant', zhHantChat.app_run_failed_notice],
    ['ko-KR', koKRChat.app_run_failed_notice]
  ])('resolves the app failure notice in %s', async (locale, expected) => {
    const { req, res } = httpObjects(locale);
    await withI18n({ req, res }, async () => {
      const text = await resolveAppRunFailedNotice(res);
      expect(text).toBe(expected);
      expect(text).not.toMatch(KEY_PATTERN);
      expect(text.length).toBeGreaterThan(0);
    });
  });

  it('resolves the agent notices to different localized text per locale', async () => {
    const zh = httpObjects('zh-CN');
    const en = httpObjects('en');

    const zhNotice = await withI18n(zh, () => resolveAgentRunFailedNotice(zh.res));
    const enNotice = await withI18n(en, () => resolveAgentRunFailedNotice(en.res));
    const zhFallback = await withI18n(zh, () => resolveAgentRunFailedFallback(zh.res));
    const enFallback = await withI18n(en, () => resolveAgentRunFailedFallback(en.res));

    expect(zhNotice).toBe(zhCNChat.agent_run_failed_notice);
    expect(enNotice).toBe(enChat.agent_run_failed_notice);
    expect(zhFallback).toBe(zhCNChat.agent_run_failed_fallback);
    expect(enFallback).toBe(enChat.agent_run_failed_fallback);
    expect(zhNotice).not.toBe(enNotice);
    expect(zhFallback).not.toBe(enFallback);
  });

  it('uses the default language for background/channel paths without a request context', async () => {
    // 渠道回调与后台任务没有 AsyncLocalStorage 上下文，注册的默认语言工厂应接管解析。
    await expect(resolveAppRunFailedNotice()).resolves.toBe(enChat.app_run_failed_notice);
    await expect(resolveAgentRunFailedNotice()).resolves.toBe(enChat.agent_run_failed_notice);
    await expect(resolveAgentRunFailedFallback()).resolves.toBe(enChat.agent_run_failed_fallback);
  });

  it('falls back to the built-in text instead of leaking `ns:key` for unknown keys', async () => {
    const defaultText = 'Built-in fallback notice';
    await expect(
      resolveStaticNoticeText({ key: 'chat:not_exist_notice', defaultText })
    ).resolves.toBe(defaultText);
    // 非 key 形态的原文同样原样返回默认文案，不会被误当作可翻译 key。
    await expect(
      resolveStaticNoticeText({ key: 'upstream echoed text', defaultText })
    ).resolves.toBe(defaultText);
  });
});
