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

type VectorConfigForm = SystemInstanceConfigDomainMap['vector'];

const tocItems: SettingTOCItem[] = [
  { id: 'quantizationAndLang', label: '量化与语言识别' },
  { id: 'hnsw', label: 'HNSW 索引参数' },
  { id: 'vectorConn', label: '向量库底层连接（只读）' }
];

const VectorSettingComponent = () => {
  const { effectiveConfig, isLoading, isUpdating, updateConfig } = useDomainConfig('vector');

  const { control, handleSubmit, reset } = useForm<VectorConfigForm>({
    defaultValues: effectiveConfig
  });

  useEffect(() => {
    if (effectiveConfig && Object.keys(effectiveConfig).length > 0) {
      reset(effectiveConfig);
    }
  }, [effectiveConfig, reset]);

  const onSave = handleSubmit(async (formData) => {
    const payload = {
      vqLevel: Number(formData.vqLevel) || 32,
      languageIdentifier: formData.languageIdentifier || 'lingua',
      hnswEfSearch: Number(formData.hnswEfSearch) || 100,
      hnswMaxScanTuples: Number(formData.hnswMaxScanTuples) || 100000
    };
    await updateConfig(payload);
  });

  return (
    <AdminSettingPage
      headerTitle={'向量检索策略'}
      tocItems={tocItems}
      isLoading={isLoading}
      isSaving={isUpdating}
      onSave={onSave}
    >
      {/* 1. 量化与语言识别 */}
      <AdminSettingSection id="quantizationAndLang" title="量化与语言识别">
        <SimpleGrid columns={[1, 2]} spacing={5}>
          <AdminFormItem
            label="向量量化等级 (VQ Level)"
            tooltip="向量量化压缩等级，支持 2, 4, 8, 16, 32。数值越小内存开销越低，但检索精度稍有损耗"
            isRequired
          >
            <Controller
              name="vqLevel"
              control={control}
              render={({ field }) => (
                <MySelect<number>
                  list={[
                    { label: '32 (最高精度，无损耗)', value: 32 },
                    { label: '16 (轻量量化)', value: 16 },
                    { label: '8 (平衡模式)', value: 8 },
                    { label: '4 (高压缩)', value: 4 },
                    { label: '2 (极限压缩)', value: 2 }
                  ]}
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />
          </AdminFormItem>

          <AdminFormItem
            label="全文本地语言识别引擎"
            tooltip="知识库全文检索和同义词分析时使用的语言检测器（支持 lingua 或 whatlang）"
            isRequired
          >
            <Controller
              name="languageIdentifier"
              control={control}
              render={({ field }) => (
                <MySelect<'lingua' | 'whatlang'>
                  list={[
                    { label: 'lingua (更高准确率)', value: 'lingua' },
                    { label: 'whatlang (轻量高速)', value: 'whatlang' }
                  ]}
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />
          </AdminFormItem>
        </SimpleGrid>
      </AdminSettingSection>

      {/* 2. HNSW 索引参数 */}
      <AdminSettingSection id="hnsw" title="HNSW 索引参数" showDivider>
        <SimpleGrid columns={[1, 2]} spacing={5}>
          <AdminFormItem
            label="HNSW ef_search"
            tooltip="HNSW 向量检索候选集扩大倍数，控制近邻搜索探索深度。数值越大召回率越高，计算时间相应增加"
            isRequired
          >
            <Controller
              name="hnswEfSearch"
              control={control}
              render={({ field }) => (
                <NumberInput
                  min={10}
                  max={2000}
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

          <AdminFormItem
            label="最大扫描行数 (hnswMaxScanTuples)"
            tooltip="PostgreSQL/pgvector 检索时最大扫描行数上限，防止超大知识库拖垮 PG 共享缓冲池"
            isRequired
          >
            <Controller
              name="hnswMaxScanTuples"
              control={control}
              render={({ field }) => (
                <NumberInput
                  min={1000}
                  max={5000000}
                  value={field.value ?? 100000}
                  onChange={(_, val) => field.onChange(val || 100000)}
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

      {/* 3. 向量库底层连接（只读） */}
      <AdminSettingSection id="vectorConn" title="向量库底层连接（只读）" showDivider>
        <SimpleGrid columns={[1, 2]} spacing={5}>
          <AdminFormItem
            label="当前向量数据库连接"
            tooltip="通过 PG_URL / MILVUS_ADDRESS / OCEANBASE_URL 等环境变量注入的底层基础设施拓扑"
          >
            <AdminReadonlyInput value="已通过环境变量安全注入" />
          </AdminFormItem>

          <AdminFormItem label="检索扩展模块状态" tooltip="向量近邻计算加速与索引构建状态">
            <AdminReadonlyInput value="在线运行中 (HNSW / IVFFLAT)" />
          </AdminFormItem>
        </SimpleGrid>
      </AdminSettingSection>
    </AdminSettingPage>
  );
};

export default React.memo(VectorSettingComponent);
