import { describe, expect, it } from 'vitest';
import {
  FeatureConfigReadSchema,
  FeatureConfigSchema
} from '@fastgpt/global/common/system/config/schemas/feature';
import { resolveFeatureConfigForEdition } from '@fastgpt/global/common/system/config/feature';
import {
  parseDomainOverrides,
  parseSystemInstanceConfig,
  resolveDomainEffectiveConfig,
  resolveSystemInstanceConfig
} from '@fastgpt/global/common/system/config/schema';

describe('resolveFeatureConfigForEdition', () => {
  const config = FeatureConfigSchema.parse({
    multipleDataToBase64: true,
    hideChatCopyrightSetting: true,
    showComplianceCopywriting: true,
    enableTeamPluginUpload: true,
    enableTeamModel: true,
    showOpenaiAccount: true,
    showDatasetFeishu: false,
    showDatasetYuque: false,
    showDatasetDingtalk: false,
    showPublishFeishu: true,
    showPublishDingtalk: true,
    showPublishWecom: true,
    showPublishOffiaccount: true,
    showPublishWechat: false
  });

  it('ignores stored community switches while preserving the core multimodal setting', () => {
    expect(resolveFeatureConfigForEdition({ config, commercialService: false })).toEqual({
      multipleDataToBase64: true,
      hideChatCopyrightSetting: false,
      showComplianceCopywriting: false,
      enableTeamPluginUpload: false,
      enableTeamModel: false,
      showOpenaiAccount: false,
      showDatasetFeishu: true,
      showDatasetYuque: true,
      showDatasetDingtalk: true,
      showPublishFeishu: false,
      showPublishDingtalk: false,
      showPublishWecom: false,
      showPublishOffiaccount: false,
      showPublishWechat: true
    });
    expect(config.enableTeamPluginUpload).toBe(true);
    expect(config.showDatasetFeishu).toBe(false);
  });

  it('preserves commercial configuration without applying community defaults', () => {
    expect(resolveFeatureConfigForEdition({ config, commercialService: true })).toBe(config);
  });
});

describe('legacy agentEngine compatibility (read-lenient, write-strict)', () => {
  it('parses persisted feature data containing legacy agentEngine without crashing and strips the field', () => {
    for (const legacyEngine of ['piAgent', 'fastAgent', 'legacy-unknown']) {
      const parsedRead = FeatureConfigReadSchema.parse({
        agentEngine: legacyEngine,
        multipleDataToBase64: true,
        enableTeamModel: true
      });
      expect(parsedRead).not.toHaveProperty('agentEngine');
      expect(parsedRead.multipleDataToBase64).toBe(true);
      expect(parsedRead.enableTeamModel).toBe(true);

      const parsedFullSnapshot = parseSystemInstanceConfig({
        feature: { agentEngine: legacyEngine, multipleDataToBase64: true }
      });
      expect(parsedFullSnapshot.feature).not.toHaveProperty('agentEngine');
      expect(parsedFullSnapshot.feature.multipleDataToBase64).toBe(true);

      const lenientOverrides = parseDomainOverrides({
        domain: 'feature',
        overrides: { agentEngine: legacyEngine, multipleDataToBase64: true },
        options: { strict: false }
      });
      expect(lenientOverrides).toEqual({ multipleDataToBase64: true });

      const effective = resolveDomainEffectiveConfig({
        domain: 'feature',
        overrides: { agentEngine: legacyEngine, multipleDataToBase64: true },
        options: { strict: false }
      });
      expect(effective).not.toHaveProperty('agentEngine');
      expect(effective.multipleDataToBase64).toBe(true);

      const snapshot = resolveSystemInstanceConfig(
        { feature: { agentEngine: legacyEngine, multipleDataToBase64: true } },
        { strict: false }
      );
      expect(snapshot.feature).not.toHaveProperty('agentEngine');
      expect(snapshot.feature.multipleDataToBase64).toBe(true);
    }
  });

  it('still rejects unknown non-legacy fields on FeatureConfigReadSchema and rejects agentEngine on strict writes', () => {
    expect(() =>
      FeatureConfigReadSchema.parse({
        agentEngine: 'piAgent',
        unexpectedField: true
      })
    ).toThrow();
    expect(() =>
      parseSystemInstanceConfig({
        feature: { agentEngine: 'piAgent', unexpectedField: true }
      })
    ).toThrow();
    expect(() => FeatureConfigSchema.parse({ agentEngine: 'piAgent' })).toThrow();
    expect(() =>
      parseDomainOverrides({
        domain: 'feature',
        overrides: { agentEngine: 'piAgent' }
      })
    ).toThrow();
  });
});
