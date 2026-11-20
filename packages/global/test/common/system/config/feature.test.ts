import { describe, expect, it } from 'vitest';
import { FeatureConfigSchema } from '@fastgpt/global/common/system/config/schemas/feature';
import { resolveFeatureConfigForEdition } from '@fastgpt/global/common/system/config/feature';

describe('resolveFeatureConfigForEdition', () => {
  const config = FeatureConfigSchema.parse({
    agentEngine: 'piAgent',
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

  it('ignores stored community switches while preserving the two core settings', () => {
    expect(resolveFeatureConfigForEdition({ config, commercialService: false })).toEqual({
      agentEngine: 'piAgent',
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
