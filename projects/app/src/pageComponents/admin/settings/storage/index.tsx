import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import React, { useEffect, useMemo } from 'react';
import {
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  SimpleGrid
} from '@chakra-ui/react';
import { useForm, Controller } from 'react-hook-form';
import { useDomainConfig } from '@/web/common/system/useDomainConfig';
import AdminSettingPage from '@/pageComponents/admin/settings/AdminSettingPage';
import AdminSettingSection from '@/pageComponents/admin/settings/AdminSettingSection';
import AdminFormItem from '@/pageComponents/admin/settings/AdminFormItem';
import AdminReadonlyInput from '@/pageComponents/admin/settings/AdminReadonlyInput';
import type { SettingTOCItem } from '@/pageComponents/admin/settings/AdminSettingTOC';
import type { SystemInstanceConfigDomainMap } from '@fastgpt/global/common/system/config/type';

type StorageConfigForm = SystemInstanceConfigDomainMap['storage'];

const StorageSettingComponent = () => {
  const { t } = useClientTranslation('admin');
  const tocItems: SettingTOCItem[] = useMemo(
    () => [
      // id 必须与下方 AdminSettingSection 一致：TOC 滚动定位与 ScrollSpy 都按 id 匹配
      { id: 'expiry', label: t('admin:storage_section_policy') },
      { id: 'storageConn', label: t('admin:storage_section_backend') }
    ],
    [t]
  );

  const { effectiveConfig, isLoading, isUpdating, patchConfig } = useDomainConfig('storage');

  const { control, handleSubmit, reset } = useForm<StorageConfigForm>({
    defaultValues: effectiveConfig
  });

  // 部署只读信息（由站点信息页移入）
  // FILE_DOMAIN 由环境变量注入且不下发前端，此处仅说明默认行为
  const deploymentInfo = useMemo(
    () => ({
      fileDomain: t('admin:same_as_service_domain')
    }),
    [t]
  );

  useEffect(() => {
    if (effectiveConfig && Object.keys(effectiveConfig).length > 0) {
      reset(effectiveConfig);
    }
  }, [effectiveConfig, reset]);

  const onSave = handleSubmit(async (formData) => {
    // 本页只负责文件有效期；下载模式与公开地址在核心配置页维护，用局部提交避免整域覆盖。
    await patchConfig({
      fileUrlExpiredDays: Number(formData.fileUrlExpiredDays) || 90
    });
  });

  return (
    <AdminSettingPage
      headerTitle={t('admin:page_title_storage')}
      tocItems={tocItems}
      isLoading={isLoading}
      isSaving={isUpdating}
      onSave={onSave}
    >
      {/* 1. 文件有效期 */}
      <AdminSettingSection id="expiry" title={t('admin:file_validity')}>
        <AdminFormItem
          label={t('admin:chat_temporary_files_retention_days')}
          tooltip={t('admin:retention_period_for_short_links_of_files_uploaded_or_refere')}
          isRequired
          mb={0}
        >
          <Controller
            name="fileUrlExpiredDays"
            control={control}
            render={({ field }) => (
              <NumberInput
                variant={'whiteOutline'}
                min={1}
                max={3650}
                value={field.value ?? 90}
                onChange={(_, val) => field.onChange(val || 90)}
              >
                <NumberInputField />
                <NumberInputStepper>
                  <NumberIncrementStepper />
                  <NumberDecrementStepper />
                </NumberInputStepper>
              </NumberInput>
            )}
          />
        </AdminFormItem>
      </AdminSettingSection>

      {/* 3. 对象存储底层（只读） */}
      <AdminSettingSection
        id="storageConn"
        title={t('admin:object_storage_backend_read_only')}
        showDivider
      >
        <SimpleGrid columns={[1, 2]} spacing={5}>
          <AdminFormItem
            label={t('admin:file_service_domain')}
            tooltip={t('admin:dedicated_file_storage_domain_provided_by_file_domain')}
          >
            <AdminReadonlyInput value={deploymentInfo.fileDomain} />
          </AdminFormItem>

          <AdminFormItem
            label={t('admin:object_storage_driver_status')}
            tooltip={t('admin:infrastructure_connections_configured_via_storage_environmen')}
          >
            <AdminReadonlyInput value={t('admin:storage_injected_via_env')} />
          </AdminFormItem>

          <AdminFormItem
            label={t('admin:storage_bucket_topology')}
            tooltip={t('admin:private_and_public_buckets_have_been_initialized')}
          >
            <AdminReadonlyInput value={t('admin:storage_bucket_initialized')} />
          </AdminFormItem>
        </SimpleGrid>
      </AdminSettingSection>
    </AdminSettingPage>
  );
};

export default React.memo(StorageSettingComponent);
