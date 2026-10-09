import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import React, { useEffect, useMemo } from 'react';
import { SimpleGrid, Text } from '@chakra-ui/react';
import { useForm, Controller } from 'react-hook-form';
import { useDomainConfig } from '@/web/common/system/useDomainConfig';
import AdminSettingPage from '@/pageComponents/admin/settings/AdminSettingPage';
import AdminSettingSection from '@/pageComponents/admin/settings/AdminSettingSection';
import AdminSwitchRow from '@/pageComponents/admin/settings/AdminSwitchRow';
import type { SettingTOCItem } from '@/pageComponents/admin/settings/AdminSettingTOC';
import type { SystemInstanceConfigDomainMap } from '@fastgpt/global/common/system/config/type';

type FeatureConfigForm = SystemInstanceConfigDomainMap['feature'];

const FeatureSettingComponent = () => {
  const { t } = useClientTranslation('admin');
  const tocItems: SettingTOCItem[] = useMemo(
    () => [
      { id: 'chatAndDisplay', label: t('admin:chat_display') },
      { id: 'systemFunction', label: t('admin:system_features') },
      { id: 'runtimeCapability', label: t('admin:runtime_capabilities') },
      { id: 'entryVisibility', label: t('admin:feature_section_display') }
    ],
    [t]
  );

  const { effectiveConfig, isLoading, isUpdating, updateConfig } = useDomainConfig('feature');

  const { control, handleSubmit, reset } = useForm<FeatureConfigForm>({
    defaultValues: effectiveConfig
  });

  useEffect(() => {
    if (effectiveConfig && Object.keys(effectiveConfig).length > 0) {
      reset(effectiveConfig);
    }
  }, [effectiveConfig, reset]);

  const onSave = handleSubmit(async (formData) => {
    await updateConfig(formData);
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
                isChecked={field.value}
                onChange={field.onChange}
              />
            )}
          />

          <Controller
            name="showEmptyChat"
            control={control}
            render={({ field }) => (
              <AdminSwitchRow
                label={t('admin:show_empty_chat_page')}
                tooltip={t('admin:show_feature_intro_empty_page_guidance_and_suggestions_when')}
                isChecked={field.value}
                onChange={field.onChange}
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
        </SimpleGrid>
      </AdminSettingSection>

      {/* 3. 运行时能力 */}
      <AdminSettingSection
        id="runtimeCapability"
        title={t('admin:runtime_capabilities')}
        showDivider
      >
        <SimpleGrid columns={[1, 2]} spacingX={16} spacingY={4}>
          <Controller
            name="disableCache"
            control={control}
            render={({ field }) => (
              <AdminSwitchRow
                label={t('admin:disable_runtime_cache')}
                tooltip={t('admin:disable_runtime_cache_tip')}
                isChecked={field.value}
                onChange={field.onChange}
              />
            )}
          />
        </SimpleGrid>
      </AdminSettingSection>

      {/* 4. 业务入口可见性 */}
      <AdminSettingSection
        id="entryVisibility"
        title={t('admin:feature_section_display')}
        showDivider
      >
        <Text fontSize={'sm'} fontWeight={'medium'} color={'myGray.700'} mb={3}>
          {t('admin:dataset')}
        </Text>
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

        <Text fontSize={'sm'} fontWeight={'medium'} color={'myGray.700'} mt={6} mb={3}>
          {t('admin:third_party_publish_channels')}
        </Text>
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
                label={t('admin:publish_channel_wechat_customer_service')}
                tooltip={t('admin:show_the_wechat_customer_service_publish_channel_on_the_app')}
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
