import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import React, { useEffect, useMemo } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { useDomainConfig } from '@/web/common/system/useDomainConfig';
import AdminSettingPage from '@/pageComponents/admin/settings/AdminSettingPage';
import AdminSettingSection from '@/pageComponents/admin/settings/AdminSettingSection';
import AdminSwitchRow from '@/pageComponents/admin/settings/AdminSwitchRow';
import type { SettingTOCItem } from '@/pageComponents/admin/settings/AdminSettingTOC';
import type { SystemInstanceConfigDomainMap } from '@fastgpt/global/common/system/config/type';

type SubserviceConfigForm = SystemInstanceConfigDomainMap['subservice'];

const PluginSubserviceComponent = () => {
  const { t } = useSafeTranslation();
  const { effectiveConfig, isLoading, isUpdating, patchConfig } = useDomainConfig('subservice');

  const tocItems: SettingTOCItem[] = useMemo(
    () => [{ id: 'features', label: t('admin:runtime_features') }],
    [t]
  );

  const { control, handleSubmit, reset } = useForm<SubserviceConfigForm>({
    defaultValues: effectiveConfig
  });

  useEffect(() => {
    if (effectiveConfig && Object.keys(effectiveConfig).length > 0) {
      reset(effectiveConfig);
    }
  }, [effectiveConfig, reset]);

  const onSave = handleSubmit(async (formData) => {
    await patchConfig({ plugin: formData.plugin });
  });

  return (
    <AdminSettingPage
      headerTitle={t('admin:page_title_plugin')}
      tocItems={tocItems}
      isLoading={isLoading}
      isSaving={isUpdating}
      onSave={onSave}
    >
      {/* 运行时特性 */}
      <AdminSettingSection id="features" title={t('admin:runtime_features')}>
        <Controller
          name="plugin.remoteDebug"
          control={control}
          render={({ field }) => (
            <AdminSwitchRow
              label={t('admin:enable_plugin_remote_debug_channel')}
              tooltip={t('admin:when_enabled_developers_can_connect_to_the_plugin_service_fr')}
              isChecked={field.value}
              onChange={field.onChange}
            />
          )}
        />
      </AdminSettingSection>
    </AdminSettingPage>
  );
};

export default React.memo(PluginSubserviceComponent);
