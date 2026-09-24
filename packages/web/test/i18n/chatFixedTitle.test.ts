import { describe, expect, it } from 'vitest';
import { LocaleList, type localeType } from '@fastgpt/global/common/i18n/type';
import { CHAT_FIXED_TITLE_I18N, type ChatFixedTitleKey } from '@fastgpt/global/core/chat/constants';

import enChat from '@fastgpt/web/i18n/en/chat.json';
import zhCNChat from '@fastgpt/web/i18n/zh-CN/chat.json';
import zhHantChat from '@fastgpt/web/i18n/zh-Hant/chat.json';
import koKRChat from '@fastgpt/web/i18n/ko-KR/chat.json';

/**
 * 会话标题固定文案的双份一致性校验。
 *
 * 文案唯一来源是各 locale 的 `chat.json`；`packages/service` 不能依赖 `packages/web`，所以
 * `CHAT_FIXED_TITLE_I18N` 是一份等价副本，服务端靠它按 locale 落库标题。两边漂移会让服务端
 * 写入的标题落不进可覆盖白名单，导致第二轮无法用真实问题覆盖固定文案，因此这里逐语言断言。
 */
const chatResources: Record<localeType, Record<string, string>> = {
  en: enChat,
  'zh-CN': zhCNChat,
  'zh-Hant': zhHantChat,
  'ko-KR': koKRChat
};

const i18nKeyMap: Record<ChatFixedTitleKey, string> = {
  autoExecute: 'chat_title_auto_execute',
  uploadFile: 'chat_title_upload_file'
};

describe('CHAT_FIXED_TITLE_I18N', () => {
  it('covers every supported locale', () => {
    expect(Object.keys(CHAT_FIXED_TITLE_I18N).sort()).toEqual(
      (Object.keys(i18nKeyMap) as ChatFixedTitleKey[]).sort()
    );

    for (const key of Object.keys(i18nKeyMap) as ChatFixedTitleKey[]) {
      for (const locale of LocaleList) {
        expect(
          CHAT_FIXED_TITLE_I18N[key][locale],
          `${key} is missing locale ${locale}`
        ).toBeTruthy();
      }
    }
  });

  it('matches the chat namespace resources in every locale', () => {
    for (const [key, i18nKey] of Object.entries(i18nKeyMap) as [ChatFixedTitleKey, string][]) {
      for (const locale of LocaleList) {
        expect(
          chatResources[locale][i18nKey],
          `${locale}/chat.json is missing ${i18nKey}`
        ).toBeDefined();
        expect(
          CHAT_FIXED_TITLE_I18N[key][locale],
          `CHAT_FIXED_TITLE_I18N.${key}.${locale} drifted from ${locale}/chat.json#${i18nKey}`
        ).toBe(chatResources[locale][i18nKey]);
      }
    }
  });

  it('keeps titles stable after normalization so the overwrite whitelist matches', () => {
    // 服务端 normalizeGeneratedTitle 会 trim、压缩空白并截断到 80 字；固定文案必须本身已归一，
    // 否则入库值与白名单值对不上，第二轮覆盖会静默失效。
    for (const key of Object.keys(i18nKeyMap) as ChatFixedTitleKey[]) {
      for (const locale of LocaleList) {
        const value = CHAT_FIXED_TITLE_I18N[key][locale]!;
        expect(value, `${key}.${locale} should not need trimming`).toBe(value.trim());
        expect(value, `${key}.${locale} should not contain consecutive spaces`).toBe(
          value.replace(/\s+/g, ' ')
        );
        expect(
          value.length,
          `${key}.${locale} exceeds the 80 char title limit`
        ).toBeLessThanOrEqual(80);
      }
    }
  });
});
