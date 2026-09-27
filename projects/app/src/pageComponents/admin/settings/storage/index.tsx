import React, { useEffect } from 'react';
import {
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  SimpleGrid
} from '@chakra-ui/react';
import { useForm, Controller } from 'react-hook-form';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { useDomainConfig } from '@/web/common/system/useDomainConfig';
import {
  AdminSettingPage,
  AdminSettingSection,
  AdminFormItem,
  AdminReadonlyInput,
  type SettingTOCItem
} from '@/pageComponents/admin/settings';
import type { SystemInstanceConfigDomainMap } from '@fastgpt/global/common/system/config';

type StorageConfigForm = SystemInstanceConfigDomainMap['storage'];

const tocItems: SettingTOCItem[] = [
  { id: 'download', label: '文件下载策略' },
  { id: 'expiry', label: '文件有效期' },
  { id: 'storageConn', label: '对象存储底层（只读）' }
];

const StorageSettingComponent = () => {
  const { effectiveConfig, isLoading, isUpdating, updateConfig } = useDomainConfig('storage');

  const { control, handleSubmit, reset } = useForm<StorageConfigForm>({
    defaultValues: effectiveConfig
  });

  useEffect(() => {
    if (effectiveConfig && Object.keys(effectiveConfig).length > 0) {
      reset(effectiveConfig);
    }
  }, [effectiveConfig, reset]);

  const onSave = handleSubmit(async (formData) => {
    const payload = {
      downloadMode: formData.downloadMode || 'short-proxy',
      downloadRedirectTtlSeconds: Number(formData.downloadRedirectTtlSeconds) || 300,
      fileUrlExpiredDays: Number(formData.fileUrlExpiredDays) || 90
    };
    await updateConfig(payload);
  });

  return (
    <AdminSettingPage
      headerTitle={'文件与存储策略'}
      tocItems={tocItems}
      isLoading={isLoading}
      isSaving={isUpdating}
      onSave={onSave}
    >
      {/* 1. 文件下载策略 */}
      <AdminSettingSection id="download" title="文件下载策略">
        <SimpleGrid columns={[1, 2]} spacing={5}>
          <AdminFormItem
            label="下载链接工作模式"
            tooltip="short-proxy：主站流式代理下载（安全隐藏底层存储桶签名）；short-redirect：直连对象存储预签名临时 302 重定向"
            isRequired
          >
            <Controller
              name="downloadMode"
              control={control}
              render={({ field }) => (
                <MySelect<'short-proxy' | 'short-redirect'>
                  list={[
                    { label: 'short-proxy (主站中继代理下载)', value: 'short-proxy' },
                    { label: 'short-redirect (S3 签名重定向直连)', value: 'short-redirect' }
                  ]}
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />
          </AdminFormItem>

          <AdminFormItem
            label="重定向链接有效期 (秒)"
            tooltip="short-redirect 模式下签发的 302 临时预签名下载链接的 TTL 过期时间（秒）"
            isRequired
          >
            <Controller
              name="downloadRedirectTtlSeconds"
              control={control}
              render={({ field }) => (
                <NumberInput
                  min={30}
                  max={86400}
                  value={field.value ?? 300}
                  onChange={(_, val) => field.onChange(val || 300)}
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
        </SimpleGrid>
      </AdminSettingSection>

      {/* 2. 文件有效期 */}
      <AdminSettingSection id="expiry" title="文件有效期" showDivider>
        <SimpleGrid columns={[1, 2]} spacing={5}>
          <AdminFormItem
            label="聊天文件短链有效天数"
            tooltip="聊天会话中用户上传与引用的文件短链访问保留期限（天）"
            isRequired
          >
            <Controller
              name="fileUrlExpiredDays"
              control={control}
              render={({ field }) => (
                <NumberInput
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
        </SimpleGrid>
      </AdminSettingSection>

      {/* 3. 对象存储底层连接（只读） */}
      <AdminSettingSection id="storageConn" title="对象存储底层连接（只读）" showDivider>
        <SimpleGrid columns={[1, 2]} spacing={5}>
          <AdminFormItem
            label="对象存储驱动状态"
            tooltip="通过部署环境变量 STORAGE_* 配置的基础设施连接"
          >
            <AdminReadonlyInput value="已通过环境变量安全注入" />
          </AdminFormItem>

          <AdminFormItem label="存储 Bucket 拓扑" tooltip="私有存储桶与公开存储桶已完成初始化">
            <AdminReadonlyInput value="已初始化 (Public / Private Bucket)" />
          </AdminFormItem>
        </SimpleGrid>
      </AdminSettingSection>
    </AdminSettingPage>
  );
};

export default React.memo(StorageSettingComponent);
