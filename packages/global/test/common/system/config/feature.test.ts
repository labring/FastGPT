import { describe, expect, it } from 'vitest';
import { FeatureConfigSchema } from '@fastgpt/global/common/system/config/schemas/feature';
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

describe('legacy agentEngine compatibility (z.object strips unknown keys on read, override write stays strict)', () => {
  it('parses persisted feature data containing legacy agentEngine without crashing and strips the field', () => {
    for (const legacyEngine of ['piAgent', 'fastAgent', 'legacy-unknown']) {
      const parsedFeature = FeatureConfigSchema.parse({
        agentEngine: legacyEngine,
        multipleDataToBase64: true,
        enableTeamModel: true
      });
      expect(parsedFeature).not.toHaveProperty('agentEngine');
      expect(parsedFeature.multipleDataToBase64).toBe(true);
      expect(parsedFeature.enableTeamModel).toBe(true);

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

  it('strips unknown fields on FeatureConfigSchema and full snapshot reads while still rejecting agentEngine on strict override writes', () => {
    const parsedWithExtra = FeatureConfigSchema.parse({
      agentEngine: 'piAgent',
      unexpectedField: true,
      enableTeamModel: true
    });
    expect(parsedWithExtra).not.toHaveProperty('agentEngine');
    expect(parsedWithExtra).not.toHaveProperty('unexpectedField');
    expect(parsedWithExtra.enableTeamModel).toBe(true);

    const parsedSnapshot = parseSystemInstanceConfig({
      feature: { agentEngine: 'piAgent', unexpectedField: true, multipleDataToBase64: true }
    });
    expect(parsedSnapshot.feature).not.toHaveProperty('agentEngine');
    expect(parsedSnapshot.feature).not.toHaveProperty('unexpectedField');
    expect(parsedSnapshot.feature.multipleDataToBase64).toBe(true);

    expect(() =>
      parseDomainOverrides({
        domain: 'feature',
        overrides: { agentEngine: 'piAgent' }
      })
    ).toThrow();
    expect(() =>
      resolveDomainEffectiveConfig({
        domain: 'feature',
        overrides: { agentEngine: 'piAgent' }
      })
    ).toThrow();
  });
});
