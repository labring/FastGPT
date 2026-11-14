import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import React, { useEffect, useMemo } from 'react';
import { SimpleGrid } from '@chakra-ui/react';
import { useForm, Controller } from 'react-hook-form';
import { useDomainConfig } from '@/web/common/system/useDomainConfig';
import { useAdminPermission } from '@/pageComponents/admin/useAdminPermission';
import AdminSettingPage from '@/pageComponents/admin/settings/AdminSettingPage';
import AdminSettingSection from '@/pageComponents/admin/settings/AdminSettingSection';
import AdminSwitchRow from '@/pageComponents/admin/settings/AdminSwitchRow';
import type { SettingTOCItem } from '@/pageComponents/admin/settings/AdminSettingTOC';
import type { SystemInstanceConfigDomainMap } from '@fastgpt/global/common/system/config/schema';

type FeatureConfigForm = SystemInstanceConfigDomainMap['feature'];

const FeatureSettingComponent = () => {
  const { t } = useSafeTranslation();
  const { filterConfigData } = useAdminPermission();
  const tocItems: SettingTOCItem[] = useMemo(
    () => [
      { id: 'chatAndDisplay', label: t('admin:chat_display') },
      { id: 'systemFunction', label: t('admin:system_features') },
      { id: 'thirdPartyDatasets', label: t('admin:third_party_datasets') },
      { id: 'thirdPartyPublishChannels', label: t('admin:third_party_publish_channels') }
    ],
    [t]
  );

  const { effectiveConfig, isLoading, isUpdating, patchConfig } = useDomainConfig('feature');

  const { control, handleSubmit, reset } = useForm<FeatureConfigForm>({
    defaultValues: effectiveConfig
  });

  useEffect(() => {
    if (effectiveConfig && Object.keys(effectiveConfig).length > 0) {
      reset(effectiveConfig);
    }
  }, [effectiveConfig, reset]);

  const onSave = handleSubmit(async (formData) => {
    await patchConfig(filterConfigData('feature', formData) as Record<string, unknown>);
  });

  return (
    <AdminSettingPage
      headerTitle={t('admin:page_title_feature')}
      tocItems={tocItems}
      isLoading={isLoading}
      isSaving={isUpdating}
      onSave={onSave}
    >
      {/* 1. 会话展示 */}
      <AdminSettingSection id="chatAndDisplay" title={t('admin:chat_display')}>
        <SimpleGrid columns={[1, 2]} spacingX={16} spacingY={4}>
          <Controller
            name="hideChatCopyrightSetting"
            control={control}
            render={({ field }) => (
              <AdminSwitchRow
                label={t('admin:hide_chat_copyright_setting')}
                tooltip={t('admin:when_enabled_share_pages_and_embedded_chat_windows_can_turn')}
                isChecked={!field.value}
                onChange={(checked) => field.onChange(!checked)}
              />
            )}
          />

          <Controller
            name="showComplianceCopywriting"
            control={control}
            render={({ field }) => (
              <AdminSwitchRow
                label={t('admin:show_compliance_copywriting')}
                tooltip={t('admin:show_filing_and_compliance_copy_at_the_bottom_of_the_page')}
                isChecked={field.value}
                onChange={field.onChange}
              />
            )}
          />
        </SimpleGrid>
      </AdminSettingSection>

      {/* 2. 系统功能 */}
      <AdminSettingSection id="systemFunction" title={t('admin:system_features')} showDivider>
        <SimpleGrid columns={[1, 2]} spacingX={16} spacingY={4}>
          <Controller
            name="enableTeamPluginUpload"
            control={control}
            render={({ field }) => (
              <AdminSwitchRow
                label={t('admin:allow_team_plugin_uploads')}
                tooltip={t('admin:allow_regular_team_members_to_upload_custom_plugin_packages')}
                isChecked={field.value}
                onChange={field.onChange}
              />
            )}
          />
          <Controller
            name="showOpenaiAccount"
            control={control}
            render={({ field }) => (
              <AdminSwitchRow
                label={t('admin:show_openai_account')}
                tooltip={t('admin:show_openai_account_tip')}
                isChecked={field.value}
                onChange={field.onChange}
              />
            )}
          />
          <Controller
            name="enableTeamModel"
            control={control}
            render={({ field }) => (
              <AdminSwitchRow
                label={t('admin:enable_team_model')}
                tooltip={t('admin:enable_team_model_tip')}
                isChecked={field.value}
                onChange={field.onChange}
              />
            )}
          />
        </SimpleGrid>
      </AdminSettingSection>

      {/* 3. 三方知识库 */}
      <AdminSettingSection
        id="thirdPartyDatasets"
        title={t('admin:third_party_datasets')}
        showDivider
      >
        <SimpleGrid columns={[1, 2]} spacingX={16} spacingY={4}>
          <Controller
            name="showDatasetFeishu"
            control={control}
            render={({ field }) => (
              <AdminSwitchRow
                label={t('admin:enable_feishu_data_source')}
                tooltip={t('admin:show_the_feishu_data_source_entry_on_the_dataset_creation_pa')}
                isChecked={field.value}
                onChange={field.onChange}
              />
            )}
          />
          <Controller
            name="showDatasetYuque"
            control={control}
            render={({ field }) => (
              <AdminSwitchRow
                label={t('admin:enable_yuque_data_source')}
                tooltip={t('admin:show_the_yuque_data_source_entry_on_the_dataset_creation_pag')}
                isChecked={field.value}
                onChange={field.onChange}
              />
            )}
          />
          <Controller
            name="showDatasetDingtalk"
            control={control}
            render={({ field }) => (
              <AdminSwitchRow
                label={t('admin:enable_dingtalk_data_source')}
                tooltip={t('admin:show_the_dingtalk_data_source_entry_on_the_dataset_creation')}
                isChecked={field.value}
                onChange={field.onChange}
              />
            )}
          />
        </SimpleGrid>
      </AdminSettingSection>

      {/* 4. 三方发布渠道 */}
      <AdminSettingSection
        id="thirdPartyPublishChannels"
        title={t('admin:third_party_publish_channels')}
        showDivider
      >
        <SimpleGrid columns={[1, 2]} spacingX={16} spacingY={4}>
          <Controller
            name="showPublishFeishu"
            control={control}
            render={({ field }) => (
              <AdminSwitchRow
                label={t('admin:publish_channel_feishu')}
                tooltip={t('admin:show_the_feishu_bot_publish_channel_on_the_app_publish_page')}
                isChecked={field.value}
                onChange={field.onChange}
              />
            )}
          />
          <Controller
            name="showPublishDingtalk"
            control={control}
            render={({ field }) => (
              <AdminSwitchRow
                label={t('admin:publish_channel_dingtalk')}
                tooltip={t('admin:show_the_dingtalk_bot_publish_channel_on_the_app_publish_pag')}
                isChecked={field.value}
                onChange={field.onChange}
              />
            )}
          />
          <Controller
            name="showPublishWecom"
            control={control}
            render={({ field }) => (
              <AdminSwitchRow
                label={t('admin:publish_channel_wecom')}
                tooltip={t('admin:show_the_wecom_publish_channel_on_the_app_publish_page')}
                isChecked={field.value}
                onChange={field.onChange}
              />
            )}
          />
          <Controller
            name="showPublishOffiaccount"
            control={control}
            render={({ field }) => (
              <AdminSwitchRow
                label={t('admin:publish_channel_official_account')}
                tooltip={t('admin:show_the_wechat_official_account_publish_channel_on_the_app')}
                isChecked={field.value}
                onChange={field.onChange}
              />
            )}
          />
          <Controller
            name="showPublishWechat"
            control={control}
            render={({ field }) => (
              <AdminSwitchRow
                label={t('admin:publish_channel_personal_wechat')}
                tooltip={t('admin:show_the_personal_wechat_publish_channel_on_the_app')}
                isChecked={field.value}
                onChange={field.onChange}
              />
            )}
          />
        </SimpleGrid>
      </AdminSettingSection>
    </AdminSettingPage>
  );
};

export default React.memo(FeatureSettingComponent);
