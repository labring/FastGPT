import { Box, Text } from '@chakra-ui/react';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import React, { useEffect, useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useDomainConfig } from '@/web/common/system/useDomainConfig';
import { useAdminPermission } from '@/pageComponents/admin/useAdminPermission';
import AdminSettingPage from '@/pageComponents/admin/settings/AdminSettingPage';
import AdminSettingSection from '@/pageComponents/admin/settings/AdminSettingSection';
import type { SettingTOCItem } from '@/pageComponents/admin/settings/AdminSettingTOC';
import ThirdPartyVariables from '@/pageComponents/admin/config/components/FormField/ThirdPartyVariables';
import type { SystemInstanceConfigDomainMap } from '@fastgpt/global/common/system/config/schema';
import { useSystemStore } from '@/web/common/system/useSystemStore';

type ProvidersConfigForm = Pick<
  SystemInstanceConfigDomainMap['providers'],
  'externalProviderWorkflowVariables'
>;

const ProvidersSettingComponent = () => {
  const { t } = useSafeTranslation();
  const { filterConfigData, isFieldVisible } = useAdminPermission();
  const { effectiveConfig, isLoading, isUpdating, patchConfig } = useDomainConfig('providers');

  // 按已保存值判断，允许删除最后一项后先保存；草稿为空时不能立即隐藏整个页面。
  const showWorkflowVariables =
    isFieldVisible('providers.externalProviderWorkflowVariables') &&
    (effectiveConfig.externalProviderWorkflowVariables?.length ?? 0) > 0;
  const tocItems: SettingTOCItem[] = useMemo(
    () =>
      showWorkflowVariables
        ? [{ id: 'workflowVariables', label: t('admin:provider_section_workflow_vars') }]
        : [],
    [showWorkflowVariables, t]
  );

  const form = useForm<ProvidersConfigForm>({
    defaultValues: {
      externalProviderWorkflowVariables: effectiveConfig.externalProviderWorkflowVariables
    }
  });
  const { control, handleSubmit, reset, setValue } = form;

  useEffect(() => {
    if (effectiveConfig && Object.keys(effectiveConfig).length > 0) {
      reset({
        externalProviderWorkflowVariables: effectiveConfig.externalProviderWorkflowVariables
      });
      // 配置保存后运行时在后台刷新；直接同步本次数据库回读，避免旧投影让空入口继续可见。
      useSystemStore.setState((state) => ({
        feConfigs: {
          ...state.feConfigs,
          externalProviderWorkflowVariables: effectiveConfig.externalProviderWorkflowVariables
        }
      }));
    }
  }, [effectiveConfig, reset]);

  const externalProviderWorkflowVariables = useWatch({
    control,
    name: 'externalProviderWorkflowVariables'
  });

  const onSave = handleSubmit(async (formData) => {
    if (!showWorkflowVariables) return;
    await patchConfig(filterConfigData('providers', formData) as Record<string, unknown>);
  });

  return (
    <AdminSettingPage
      form={form}
      headerTitle={t('admin:page_title_providers')}
      tocItems={tocItems}
      isLoading={isLoading}
      isSaving={isUpdating}
      onSave={showWorkflowVariables ? onSave : undefined}
    >
      {/* 外部提供商工作流变量 */}
      {showWorkflowVariables && (
        <AdminSettingSection
          id="workflowVariables"
          title={t('admin:provider_section_workflow_vars')}
        >
          <Box
            borderWidth={
              form.getFieldState('externalProviderWorkflowVariables', form.formState).error
                ? '1px'
                : undefined
            }
            borderColor={'red.500'}
            borderRadius={'md'}
          >
            <ThirdPartyVariables
              value={externalProviderWorkflowVariables}
              onChange={(val) =>
                setValue(
                  'externalProviderWorkflowVariables',
                  val.map((item) => ({ ...item, url: item.url ?? '' })),
                  { shouldDirty: true }
                )
              }
              title={t('admin:global_variable_list')}
            />
            {form.getFieldState('externalProviderWorkflowVariables', form.formState).error && (
              <Text color={'red.500'} fontSize={'xs'}>
                {t('admin:failed_to_save_settings')}
              </Text>
            )}
          </Box>
        </AdminSettingSection>
      )}
    </AdminSettingPage>
  );
};

export default React.memo(ProvidersSettingComponent);
