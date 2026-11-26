import { describe, expect, it } from 'vitest';
import { workflowTemplateResources } from '@fastgpt/workflow-core/template/i18n';
import enApp from '../../../../i18n/en/app.json';
import enCommon from '../../../../i18n/en/common.json';
import enWorkflow from '../../../../i18n/en/workflow.json';
import zhCnApp from '../../../../i18n/zh-CN/app.json';
import zhCnCommon from '../../../../i18n/zh-CN/common.json';
import zhCnWorkflow from '../../../../i18n/zh-CN/workflow.json';
import zhHantApp from '../../../../i18n/zh-Hant/app.json';
import zhHantCommon from '../../../../i18n/zh-Hant/common.json';
import zhHantWorkflow from '../../../../i18n/zh-Hant/workflow.json';
import koApp from '../../../../i18n/ko-KR/app.json';
import koCommon from '../../../../i18n/ko-KR/common.json';
import koWorkflow from '../../../../i18n/ko-KR/workflow.json';

const webLocales: Record<string, Record<string, Record<string, string>>> = {
  en: { app: enApp, common: enCommon, workflow: enWorkflow },
  'zh-CN': { app: zhCnApp, common: zhCnCommon, workflow: zhCnWorkflow },
  'zh-Hant': { app: zhHantApp, common: zhHantCommon, workflow: zhHantWorkflow },
  'ko-KR': { app: koApp, common: koCommon, workflow: koWorkflow }
};

describe('workflow template i18n parity', () => {
  it.each(['en', 'zh-CN', 'zh-Hant', 'ko-KR'])(
    'keeps @fastgpt/workflow-core template dictionary in sync with @fastgpt/web %s resources',
    (locale) => {
      const coreDict = workflowTemplateResources[locale];
      expect(coreDict).toBeDefined();
      const namespaces = webLocales[locale];
      for (const [fullKey, value] of Object.entries(coreDict)) {
        const sep = fullKey.indexOf(':');
        expect(sep).toBeGreaterThan(0);
        const ns = fullKey.slice(0, sep);
        const key = fullKey.slice(sep + 1);
        expect(namespaces[ns]?.[key]).toBe(value);
      }
    }
  );
});
