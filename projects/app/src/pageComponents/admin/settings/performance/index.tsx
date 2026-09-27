import React, { useEffect } from 'react';
import {
  Input,
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

type PerformanceConfigForm = SystemInstanceConfigDomainMap['performance'];

const tocItems: SettingTOCItem[] = [
  { id: 'workflow', label: '工作流执行限制' },
  { id: 'parse', label: '文档解析限制' },
  { id: 'dataset', label: '知识库处理并发' },
  { id: 'chatAndTracking', label: '对话限流与日志' },
  { id: 'streamResume', label: '流式恢复与保护' },
  { id: 'taskAndChannel', label: '任务与渠道并发' }
];

const PerformanceSettingComponent = () => {
  const { effectiveConfig, isLoading, isUpdating, updateConfig } = useDomainConfig('performance');

  const { control, handleSubmit, reset, register } = useForm<PerformanceConfigForm>({
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
      headerTitle={'性能与并发'}
      tocItems={tocItems}
      isLoading={isLoading}
      isSaving={isUpdating}
      onSave={onSave}
    >
      {/* 1. 工作流执行限制 */}
      <AdminSettingSection id="workflow" title="工作流执行限制">
        <SimpleGrid columns={[1, 3]} spacing={5}>
          <AdminFormItem
            label="单次最大运行次数"
            tooltip="单个工作流一次执行允许的最大节点运行步数，防止死循环"
            isRequired
          >
            <Controller
              name="workflow.maxRunTimes"
              control={control}
              render={({ field }) => (
                <NumberInput
                  min={1}
                  max={5000}
                  value={field.value ?? 500}
                  onChange={(_, val) => field.onChange(val || 500)}
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
            label="最大循环/数组长度"
            tooltip="循环节点与并行分支允许处理的最大输入数组长度"
            isRequired
          >
            <Controller
              name="workflow.maxLoopTimes"
              control={control}
              render={({ field }) => (
                <NumberInput
                  min={1}
                  max={1000}
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
            label="并行节点并发上限"
            tooltip="并行分支执行时的最大同时并发线程数（必须小于等于最大循环长度）"
            isRequired
          >
            <Controller
              name="workflow.parallelMaxConcurrency"
              control={control}
              render={({ field }) => (
                <NumberInput
                  min={1}
                  max={100}
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
        </SimpleGrid>
      </AdminSettingSection>

      {/* 2. 文档解析限制 */}
      <AdminSettingSection id="parse" title="文档解析限制" showDivider>
        <SimpleGrid columns={[1, 3]} spacing={5}>
          <AdminFormItem
            label="文件解析超时 (秒)"
            tooltip="Worker 进程解析单份文档允许的最长处理时间（秒）"
            isRequired
          >
            <Controller
              name="parse.fileTimeoutSeconds"
              control={control}
              render={({ field }) => (
                <NumberInput
                  min={60}
                  max={6000}
                  value={field.value ?? 600}
                  onChange={(_, val) => field.onChange(val || 600)}
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
            label="XLSX 最大行数"
            tooltip="解析 Excel 电子表格时允许的最大行数"
            isRequired
          >
            <Controller
              name="parse.xlsxMaxRows"
              control={control}
              render={({ field }) => (
                <NumberInput
                  min={1}
                  max={1048576}
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

          <AdminFormItem
            label="XLSX 最大列数"
            tooltip="解析 Excel 电子表格时允许的最大列数"
            isRequired
          >
            <Controller
              name="parse.xlsxMaxColumns"
              control={control}
              render={({ field }) => (
                <NumberInput
                  min={1}
                  max={16384}
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
            label="XLSX 最大单元格数"
            tooltip="解析 Excel 电子表格时允许的最大总单元格数量"
            isRequired
          >
            <Controller
              name="parse.xlsxMaxCells"
              control={control}
              render={({ field }) => (
                <NumberInput
                  min={1}
                  max={10000000}
                  value={field.value ?? 1000000}
                  onChange={(_, val) => field.onChange(val || 1000000)}
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
            label="XLSX 最大合并单元格数"
            tooltip="解析 Excel 电子表格时允许的最大合并单元格数"
            isRequired
          >
            <Controller
              name="parse.xlsxMaxMergedCells"
              control={control}
              render={({ field }) => (
                <NumberInput
                  min={1}
                  max={5000000}
                  value={field.value ?? 1000000}
                  onChange={(_, val) => field.onChange(val || 1000000)}
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
            label="HTML 转换最大字符数"
            tooltip="HTML 转换为 Markdown 允许处理的最大字符上限"
            isRequired
          >
            <Controller
              name="parse.maxHtmlTransformChars"
              control={control}
              render={({ field }) => (
                <NumberInput
                  min={1}
                  max={10000000}
                  value={field.value ?? 1000000}
                  onChange={(_, val) => field.onChange(val || 1000000)}
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

      {/* 3. 知识库处理并发 */}
      <AdminSettingSection id="dataset" title="知识库处理并发" showDivider>
        <SimpleGrid columns={[1, 3]} spacing={5}>
          <AdminFormItem
            label="文档解析并发数"
            tooltip="知识库队列中允许并行执行文件解析的最大任务进程数"
            isRequired
          >
            <Controller
              name="dataset.parseMaxProcess"
              control={control}
              render={({ field }) => (
                <NumberInput
                  min={1}
                  max={100}
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
            label="向量化处理并发数"
            tooltip="知识库向量化 Embedding 最大并发任务数"
            isRequired
          >
            <Controller
              name="dataset.vectorMaxProcess"
              control={control}
              render={({ field }) => (
                <NumberInput
                  min={1}
                  max={100}
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
            label="QA 自动生成并发数"
            tooltip="自动问答对拆解与生成的并发处理数"
            isRequired
          >
            <Controller
              name="dataset.qaMaxProcess"
              control={control}
              render={({ field }) => (
                <NumberInput
                  min={1}
                  max={100}
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
            label="多模态理解并发数"
            tooltip="VLM 模型图像理解与描述生成的最大处理并发数"
            isRequired
          >
            <Controller
              name="dataset.vlmMaxProcess"
              control={control}
              render={({ field }) => (
                <NumberInput
                  min={1}
                  max={100}
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
            label="检索召回候选集上限"
            tooltip="知识库检索日志详情记录的召回候选集上限，0 表示不记录"
            isRequired
          >
            <Controller
              name="dataset.retrievalResultsLimit"
              control={control}
              render={({ field }) => (
                <NumberInput
                  min={0}
                  max={100}
                  value={field.value ?? 0}
                  onChange={(_, val) => field.onChange(val || 0)}
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

      {/* 4. 对话限流与日志 */}
      <AdminSettingSection id="chatAndTracking" title="对话限流与日志" showDivider>
        <SimpleGrid columns={[1, 2]} spacing={5}>
          <AdminFormItem
            label="对话 QPM 上限"
            tooltip="系统级对话每分钟请求量上限（若用户套餐有独立限制则优先执行套餐限制）"
            isRequired
          >
            <Controller
              name="chat.maxQpm"
              control={control}
              render={({ field }) => (
                <NumberInput
                  min={1}
                  max={50000}
                  value={field.value ?? 5000}
                  onChange={(_, val) => field.onChange(val || 5000)}
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

          <AdminFormItem label="对话日志 SourceId 前缀" tooltip="推送对话日志时标识当前实例的前缀">
            <Input {...register('chat.logSourceIdPrefix')} placeholder="fastgpt-" />
          </AdminFormItem>

          <AdminFormItem label="对话日志外部推送地址" tooltip="推送对话记录的外部 Webhook URL">
            <Input {...register('chat.logUrl')} placeholder="https://log.example.com" />
          </AdminFormItem>

          <AdminFormItem
            label="对话日志推送延迟 (毫秒)"
            tooltip="批量推送日志的间隔延迟时间（毫秒），留空表示实时推送"
          >
            <Controller
              name="chat.logInterval"
              control={control}
              render={({ field }) => (
                <NumberInput
                  min={0}
                  max={60000}
                  value={field.value ?? ''}
                  onChange={(_, val) => field.onChange(isNaN(val) || val <= 0 ? null : val)}
                >
                  <NumberInputField placeholder="留空表示实时推送" />
                  <NumberInputStepper>
                    <NumberIncrementStepper />
                    <NumberDecrementStepper />
                  </NumberInputStepper>
                </NumberInput>
              )}
            />
          </AdminFormItem>

          <AdminFormItem
            label="埋点批量写入间隔 (毫秒)"
            tooltip="后台追踪埋点聚合写入数据库的缓冲时间（毫秒）"
            isRequired
          >
            <Controller
              name="tracking.batchUpdateTime"
              control={control}
              render={({ field }) => (
                <NumberInput
                  min={100}
                  max={60000}
                  value={field.value ?? 10000}
                  onChange={(_, val) => field.onChange(val || 10000)}
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
            label="LLM 追踪保留时长 (小时)"
            tooltip="LLM 调用链路追踪详情日志的保留时长（小时）"
            isRequired
          >
            <Controller
              name="tracking.retentionHours"
              control={control}
              render={({ field }) => (
                <NumberInput
                  min={1}
                  max={720}
                  value={field.value ?? 6}
                  onChange={(_, val) => field.onChange(val || 6)}
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

      {/* 5. 流式恢复与保护 */}
      <AdminSettingSection id="streamResume" title="流式恢复与保护" showDivider>
        <SimpleGrid columns={[1, 2]} spacing={5}>
          <AdminFormItem
            label="流会话保留时长 (秒)"
            tooltip="断线可恢复流式对话在 Redis 中的存活 TTL（秒）"
            isRequired
          >
            <Controller
              name="streamResume.ttlSeconds"
              control={control}
              render={({ field }) => (
                <NumberInput
                  min={30}
                  max={3600}
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

          <AdminFormItem
            label="对话完成后保留时长 (秒)"
            tooltip="流式对话全部输出完毕后，缓存快照允许客户端拉取的保留时间（秒）"
            isRequired
          >
            <Controller
              name="streamResume.postCompleteTtlSeconds"
              control={control}
              render={({ field }) => (
                <NumberInput
                  min={5}
                  max={600}
                  value={field.value ?? 30}
                  onChange={(_, val) => field.onChange(val || 30)}
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
            label="Redis 内存占用比例上限"
            tooltip="断线流式缓存占用 Redis maxmemory 的最大安全比例（0.0 ~ 1.0）"
            isRequired
          >
            <Controller
              name="streamResume.redisMaxmemoryRatio"
              control={control}
              render={({ field }) => (
                <NumberInput
                  min={0.1}
                  max={1.0}
                  step={0.05}
                  value={field.value ?? 0.5}
                  onChange={(_, val) => field.onChange(val || 0.5)}
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
            label="Redis 内存检查间隔 (毫秒)"
            tooltip="检查 Redis 内存阈值的轮询检测周期（毫秒）"
            isRequired
          >
            <Controller
              name="streamResume.redisMemoryCheckIntervalMs"
              control={control}
              render={({ field }) => (
                <NumberInput
                  min={500}
                  max={60000}
                  value={field.value ?? 5000}
                  onChange={(_, val) => field.onChange(val || 5000)}
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

      {/* 6. 任务与渠道并发 */}
      <AdminSettingSection id="taskAndChannel" title="任务与渠道并发" showDivider>
        <SimpleGrid columns={[1, 2]} spacing={5}>
          <AdminFormItem
            label="评估任务并发上限"
            tooltip="后台大模型 Benchmark 评估任务允许的最大并发量"
            isRequired
          >
            <Controller
              name="task.evalConcurrency"
              control={control}
              render={({ field }) => (
                <NumberInput
                  min={1}
                  max={50}
                  value={field.value ?? 3}
                  onChange={(_, val) => field.onChange(val || 3)}
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
            label="公众号渠道消息处理并发"
            tooltip="微信公众号服务号接入时允许的最大同时处理请求并发数"
            isRequired
          >
            <Controller
              name="channel.wechatConcurrency"
              control={control}
              render={({ field }) => (
                <NumberInput
                  min={10}
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
    </AdminSettingPage>
  );
};

export default React.memo(PerformanceSettingComponent);
