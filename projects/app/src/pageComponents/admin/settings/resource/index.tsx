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
import { useDomainConfig } from '@/web/common/system/useDomainConfig';
import {
  AdminSettingPage,
  AdminSettingSection,
  AdminFormItem,
  type SettingTOCItem
} from '@/pageComponents/admin/settings';
import type { SystemInstanceConfigDomainMap } from '@fastgpt/global/common/system/config';

type ResourceConfigForm = SystemInstanceConfigDomainMap['resource'];

const tocItems: SettingTOCItem[] = [
  { id: 'requestAndText', label: '请求与文本限制' },
  { id: 'folder', label: '文件夹结构限制' },
  { id: 'upload', label: '文件上传限制' }
];

const ResourceSettingComponent = () => {
  const { effectiveConfig, isLoading, isUpdating, updateConfig } = useDomainConfig('resource');

  const { control, handleSubmit, reset } = useForm<ResourceConfigForm>({
    defaultValues: effectiveConfig
  });

  useEffect(() => {
    if (effectiveConfig && Object.keys(effectiveConfig).length > 0) {
      reset(effectiveConfig);
    }
  }, [effectiveConfig, reset]);

  const onSave = handleSubmit(async (formData) => {
    const payload = {
      serviceRequestMaxContentLength: Number(formData.serviceRequestMaxContentLength) || 10,
      systemMaxStringLengthM: Number(formData.systemMaxStringLengthM) || 100,
      maxFolderDepth: Number(formData.maxFolderDepth) || 4,
      appFolderMaxAmount: Number(formData.appFolderMaxAmount) || 1000,
      datasetFolderMaxAmount: Number(formData.datasetFolderMaxAmount) || 1000,
      uploadFileMaxSize: Number(formData.uploadFileMaxSize) || 1000,
      uploadFileMaxAmount: Number(formData.uploadFileMaxAmount) || 1000
    };
    await updateConfig(payload);
  });

  return (
    <AdminSettingPage
      headerTitle={'资源限制'}
      tocItems={tocItems}
      isLoading={isLoading}
      isSaving={isUpdating}
      onSave={onSave}
    >
      {/* 1. 请求与文本限制 */}
      <AdminSettingSection id="requestAndText" title="请求与文本限制">
        <SimpleGrid columns={[1, 2]} spacing={5}>
          <AdminFormItem
            label="服务端请求体上限 (MB)"
            tooltip="服务接口允许接收的最大 Request Body 大小（MB）"
            isRequired
          >
            <Controller
              name="serviceRequestMaxContentLength"
              control={control}
              render={({ field }) => (
                <NumberInput
                  min={1}
                  max={500}
                  value={field.value ?? 10}
                  onChange={(_, val) => field.onChange(val || 10)}
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

          <AdminFormItem
            label="同步字符串处理最大字符数 (M)"
            tooltip="变量替换等 CPU 密集文本同步处理的最大字符数（1M = 1,000,000 字符），防止阻塞 Node 事件循环"
            isRequired
          >
            <Controller
              name="systemMaxStringLengthM"
              control={control}
              render={({ field }) => (
                <NumberInput
                  min={1}
                  max={100}
                  value={field.value ?? 100}
                  onChange={(_, val) => field.onChange(val || 100)}
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

      {/* 2. 文件夹结构限制 */}
      <AdminSettingSection id="folder" title="文件夹结构限制" showDivider>
        <SimpleGrid columns={[1, 3]} spacing={5}>
          <AdminFormItem
            label="最大目录层级深度"
            tooltip="应用与知识库文件夹嵌套的最大层数（限制为 2~20 层）"
            isRequired
          >
            <Controller
              name="maxFolderDepth"
              control={control}
              render={({ field }) => (
                <NumberInput
                  min={2}
                  max={20}
                  value={field.value ?? 4}
                  onChange={(_, val) => field.onChange(val || 4)}
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

          <AdminFormItem
            label="应用文件夹数量上限"
            tooltip="每个团队最多允许创建的应用文件夹数量"
            isRequired
          >
            <Controller
              name="appFolderMaxAmount"
              control={control}
              render={({ field }) => (
                <NumberInput
                  min={1}
                  max={10000}
                  value={field.value ?? 1000}
                  onChange={(_, val) => field.onChange(val || 1000)}
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

          <AdminFormItem
            label="知识库文件夹数量上限"
            tooltip="每个团队最多允许创建的知识库文件夹数量"
            isRequired
          >
            <Controller
              name="datasetFolderMaxAmount"
              control={control}
              render={({ field }) => (
                <NumberInput
                  min={1}
                  max={10000}
                  value={field.value ?? 1000}
                  onChange={(_, val) => field.onChange(val || 1000)}
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

      {/* 3. 文件上传限制 */}
      <AdminSettingSection id="upload" title="文件上传限制" showDivider>
        <SimpleGrid columns={[1, 2]} spacing={5}>
          <AdminFormItem
            label="单文件上传体积上限 (MB)"
            tooltip="单次上传单个文件的最大体积上限（MB）"
            isRequired
          >
            <Controller
              name="uploadFileMaxSize"
              control={control}
              render={({ field }) => (
                <NumberInput
                  min={1}
                  max={10000}
                  value={field.value ?? 1000}
                  onChange={(_, val) => field.onChange(val || 1000)}
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

          <AdminFormItem
            label="批量上传文件数量上限"
            tooltip="单次批量上传对话文件或知识库文档的最大文件数量"
            isRequired
          >
            <Controller
              name="uploadFileMaxAmount"
              control={control}
              render={({ field }) => (
                <NumberInput
                  min={1}
                  max={5000}
                  value={field.value ?? 1000}
                  onChange={(_, val) => field.onChange(val || 1000)}
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
    </AdminSettingPage>
  );
};

export default React.memo(ResourceSettingComponent);
