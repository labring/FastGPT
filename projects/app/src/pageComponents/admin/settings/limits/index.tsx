import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import React, { useEffect, useMemo } from 'react';
import {
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  SimpleGrid,
  Text
} from '@chakra-ui/react';
import { useForm, Controller } from 'react-hook-form';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useDomainConfig, batchUpdateDomainConfigApi } from '@/web/common/system/useDomainConfig';
import AdminSettingPage from '@/pageComponents/admin/settings/AdminSettingPage';
import AdminSettingSection from '@/pageComponents/admin/settings/AdminSettingSection';
import AdminFormItem from '@/pageComponents/admin/settings/AdminFormItem';
import AdminReadonlyInput from '@/pageComponents/admin/settings/AdminReadonlyInput';
import type { SettingTOCItem } from '@/pageComponents/admin/settings/AdminSettingTOC';
import type { SystemInstanceConfigDomainMap } from '@fastgpt/global/common/system/config/type';

type LimitsConfigForm = SystemInstanceConfigDomainMap['resource'] &
  SystemInstanceConfigDomainMap['performance'] & {
    openApiKeyMaxCount: SystemInstanceConfigDomainMap['auth']['openApiKeyMaxCount'];
    fileUrlExpiredDays: SystemInstanceConfigDomainMap['storage']['fileUrlExpiredDays'];
    hnswEfSearch: SystemInstanceConfigDomainMap['vector']['hnswEfSearch'];
    hnswMaxScanTuples: SystemInstanceConfigDomainMap['vector']['hnswMaxScanTuples'];
  };

/** 数字输入统一尺寸，避免各字段各自声明宽度 */
const numberInputProps = { variant: 'whiteOutline' as const, maxW: '400px' };

/**
 * 限制与并发页：由原「资源限制」与「性能与并发」合并而成。
 * 字段跨越 resource / performance / auth / storage / vector 五个配置域，
 * 保存时逐域提交，各自携带 revision 由服务端做乐观锁校验。
 */
const LimitsSettingComponent = () => {
  const { t } = useSafeTranslation();
  const tocItems: SettingTOCItem[] = useMemo(
    () => [
      { id: 'requestAndText', label: t('admin:request_text_limits') },
      { id: 'folder', label: t('admin:folder_structure_limits') },
      { id: 'uploadAndExpiry', label: t('admin:file_upload_validity') },
      { id: 'exportSync', label: t('admin:export_sync_rate_limiting') },
      { id: 'workflow', label: t('admin:workflow_execution_limits') },
      { id: 'parse', label: t('admin:document_parsing_limits') },
      { id: 'dataset', label: t('admin:dataset_processing_concurrency') },
      { id: 'vectorIndex', label: t('admin:vector_index_parameters') },
      { id: 'chatAndTracking', label: t('admin:chat_rate_limiting_tracking') },
      { id: 'streamResume', label: t('admin:stream_resume_protection') },
      { id: 'taskAndChannel', label: t('admin:task_channel_concurrency') }
    ],
    [t]
  );
  const resource = useDomainConfig('resource');
  const performance = useDomainConfig('performance');
  const auth = useDomainConfig('auth');
  const storage = useDomainConfig('storage');
  const vector = useDomainConfig('vector');

  const isLoading =
    resource.isLoading ||
    performance.isLoading ||
    auth.isLoading ||
    storage.isLoading ||
    vector.isLoading;

  const { control, handleSubmit, reset } = useForm<LimitsConfigForm>({
    defaultValues: {
      ...resource.effectiveConfig,
      ...performance.effectiveConfig,
      openApiKeyMaxCount: 100,
      fileUrlExpiredDays: 90,
      hnswEfSearch: 100,
      hnswMaxScanTuples: 100000
    }
  });

  useEffect(() => {
    if (isLoading) return;
    reset({
      ...resource.effectiveConfig,
      ...performance.effectiveConfig,
      openApiKeyMaxCount: auth.effectiveConfig?.openApiKeyMaxCount ?? 100,
      fileUrlExpiredDays: storage.effectiveConfig?.fileUrlExpiredDays ?? 90,
      hnswEfSearch: vector.effectiveConfig?.hnswEfSearch ?? 100,
      hnswMaxScanTuples: vector.effectiveConfig?.hnswMaxScanTuples ?? 100000
    });
  }, [
    resource.effectiveConfig,
    performance.effectiveConfig,
    auth.effectiveConfig,
    storage.effectiveConfig,
    vector.effectiveConfig,
    isLoading,
    reset
  ]);

  const { runAsync: onSave, loading: isSaving } = useRequest(
    async (formData: LimitsConfigForm) => {
      // 跨域原子提交：resource、performance、auth、storage、vector 五个域合并为单个事务请求
      await batchUpdateDomainConfigApi({
        items: [
          {
            domain: 'resource',
            expectedRevision: resource.revision,
            overrides: {
              serviceRequestMaxContentLength: Number(formData.serviceRequestMaxContentLength) || 10,
              systemMaxStringLengthM: Number(formData.systemMaxStringLengthM) || 100,
              maxFolderDepth: Number(formData.maxFolderDepth) || 4,
              appFolderMaxAmount: Number(formData.appFolderMaxAmount) || 1000,
              datasetFolderMaxAmount: Number(formData.datasetFolderMaxAmount) || 1000,
              uploadFileMaxSize: Number(formData.uploadFileMaxSize) || 1000,
              uploadFileMaxAmount: Number(formData.uploadFileMaxAmount) || 1000,
              exportDatasetLimitMinutes: Number(formData.exportDatasetLimitMinutes) || 0,
              websiteSyncLimitMinuted: Number(formData.websiteSyncLimitMinuted) || 0
            }
          },
          {
            domain: 'performance',
            expectedRevision: performance.revision,
            overrides: {
              workflow: formData.workflow,
              parse: formData.parse,
              dataset: formData.dataset,
              chat: formData.chat,
              streamResume: formData.streamResume,
              tracking: formData.tracking,
              task: formData.task,
              channel: formData.channel
            }
          },
          {
            domain: 'auth',
            expectedRevision: auth.revision,
            overrides: {
              ...(auth.overrides as Record<string, unknown>),
              openApiKeyMaxCount: Number(formData.openApiKeyMaxCount) || 100
            }
          },
          {
            domain: 'storage',
            expectedRevision: storage.revision,
            overrides: {
              ...(storage.overrides as Record<string, unknown>),
              fileUrlExpiredDays: Number(formData.fileUrlExpiredDays) || 90
            }
          },
          {
            domain: 'vector',
            expectedRevision: vector.revision,
            overrides: {
              ...(vector.overrides as Record<string, unknown>),
              hnswEfSearch: Number(formData.hnswEfSearch) || 100,
              hnswMaxScanTuples: Number(formData.hnswMaxScanTuples) || 100000
            }
          }
        ]
      });
    },
    {
      successToast: 'admin:settings_saved',
      errorToast: 'admin:failed_to_save_settings',
      onSuccess: () => {
        void resource.refetch();
        void performance.refetch();
        void auth.refetch();
        void storage.refetch();
        void vector.refetch();
      }
    }
  );

  const submit = useMemo(() => handleSubmit((data) => onSave(data)), [handleSubmit, onSave]);

  return (
    <AdminSettingPage
      headerTitle={t('admin:page_title_limits')}
      tocItems={tocItems}
      isLoading={isLoading}
      isSaving={isSaving}
      onSave={submit}
    >
      {/* 1. 请求与文本限制 */}
      <AdminSettingSection id="requestAndText" title={t('admin:request_text_limits')}>
        <SimpleGrid columns={[1, 2]} spacing={5}>
          <AdminFormItem
            label={t('admin:server_request_body_max_size_mb')}
            tooltip={t('admin:max_request_body_size_accepted_by_the_service_api_mb')}
            isRequired
          >
            <Controller
              name="serviceRequestMaxContentLength"
              control={control}
              render={({ field }) => (
                <NumberInput
                  {...numberInputProps}
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
            label={t('admin:max_characters_for_sync_string_processing_m')}
            tooltip={t('admin:max_characters_for_cpu_intensive_synchronous_text_processing')}
            isRequired
          >
            <Controller
              name="systemMaxStringLengthM"
              control={control}
              render={({ field }) => (
                <NumberInput
                  {...numberInputProps}
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

          <AdminFormItem
            label={t('admin:openapi_key_max_count')}
            tooltip={t('admin:max_openapi_keys_per_team_to_prevent_key_sprawl')}
            isRequired
          >
            <Controller
              name="openApiKeyMaxCount"
              control={control}
              render={({ field }) => (
                <NumberInput
                  {...numberInputProps}
                  min={1}
                  max={10000}
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
      <AdminSettingSection id="folder" title={t('admin:folder_structure_limits')} showDivider>
        <SimpleGrid columns={[1, 3]} spacing={5}>
          <AdminFormItem
            label={t('admin:max_folder_depth')}
            tooltip={t('admin:max_folder_nesting_depth_for_apps_and_datasets_2_to_20_level')}
            isRequired
          >
            <Controller
              name="maxFolderDepth"
              control={control}
              render={({ field }) => (
                <NumberInput
                  {...numberInputProps}
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
            label={t('admin:app_folder_limit')}
            tooltip={t('admin:max_app_folders_per_team')}
            isRequired
          >
            <Controller
              name="appFolderMaxAmount"
              control={control}
              render={({ field }) => (
                <NumberInput
                  {...numberInputProps}
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
            label={t('admin:dataset_folder_limit')}
            tooltip={t('admin:max_dataset_folders_per_team')}
            isRequired
          >
            <Controller
              name="datasetFolderMaxAmount"
              control={control}
              render={({ field }) => (
                <NumberInput
                  {...numberInputProps}
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

      {/* 3. 文件上传与有效期 */}
      <AdminSettingSection id="uploadAndExpiry" title={t('admin:file_upload_validity')} showDivider>
        <SimpleGrid columns={[1, 3]} spacing={5}>
          <AdminFormItem
            label={t('admin:single_file_upload_size_limit_mb')}
            tooltip={t('admin:max_size_of_a_single_uploaded_file_mb')}
            isRequired
          >
            <Controller
              name="uploadFileMaxSize"
              control={control}
              render={({ field }) => (
                <NumberInput
                  {...numberInputProps}
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
            label={t('admin:batch_upload_file_count_limit')}
            tooltip={t('admin:max_files_per_batch_upload_of_chat_or_dataset_documents')}
            isRequired
          >
            <Controller
              name="uploadFileMaxAmount"
              control={control}
              render={({ field }) => (
                <NumberInput
                  {...numberInputProps}
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

          <AdminFormItem
            label={t('admin:chat_temporary_files_retention_days')}
            tooltip={t('admin:retention_period_for_short_links_of_files_uploaded_or_refere')}
            isRequired
          >
            <Controller
              name="fileUrlExpiredDays"
              control={control}
              render={({ field }) => (
                <NumberInput
                  {...numberInputProps}
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

        <Text fontSize={'sm'} fontWeight={'medium'} color={'myGray.700'} mt={6} mb={3}>
          {t('admin:object_storage_backend_read_only')}
        </Text>
        <SimpleGrid columns={[1, 2]} spacing={5}>
          <AdminFormItem
            label={t('admin:file_service_domain')}
            tooltip={t('admin:dedicated_file_storage_domain_provided_by_file_domain')}
          >
            {/* FILE_DOMAIN 由环境变量注入且不下发前端，此处仅说明默认行为 */}
            <AdminReadonlyInput value={t('admin:same_as_service_domain')} />
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

      {/* 4. 导出与同步限流 */}
      <AdminSettingSection id="exportSync" title={t('admin:export_sync_rate_limiting')} showDivider>
        <SimpleGrid columns={[1, 2]} spacing={5}>
          <AdminFormItem
            label={t('admin:dataset_export_cooldown_minutes_2')}
            tooltip={t('admin:cooldown_minutes_between_two_dataset_exports_for_the_same_te')}
            isRequired
          >
            <Controller
              name="exportDatasetLimitMinutes"
              control={control}
              render={({ field }) => (
                <NumberInput
                  {...numberInputProps}
                  min={0}
                  max={10000}
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

          <AdminFormItem
            label={t('admin:website_sync_cooldown_minutes_2')}
            tooltip={t('admin:cooldown_minutes_between_two_website_syncs_for_the_same_team')}
            isRequired
          >
            <Controller
              name="websiteSyncLimitMinuted"
              control={control}
              render={({ field }) => (
                <NumberInput
                  {...numberInputProps}
                  min={0}
                  max={10000}
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

      {/* 5. 工作流执行限制 */}
      <AdminSettingSection id="workflow" title={t('admin:workflow_execution_limits')} showDivider>
        <SimpleGrid columns={[1, 3]} spacing={5}>
          <AdminFormItem
            label={t('admin:max_run_times_per_execution')}
            tooltip={t('admin:max_node_steps_per_workflow_run_to_prevent_infinite_loops')}
            isRequired
          >
            <Controller
              name="workflow.maxRunTimes"
              control={control}
              render={({ field }) => (
                <NumberInput
                  {...numberInputProps}
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
            label={t('admin:max_loop_array_length')}
            tooltip={t('admin:max_input_array_length_allowed_by_loop_nodes_and_parallel_br')}
            isRequired
          >
            <Controller
              name="workflow.maxLoopTimes"
              control={control}
              render={({ field }) => (
                <NumberInput
                  {...numberInputProps}
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
            label={t('admin:parallel_node_concurrency_limit')}
            tooltip={t('admin:max_concurrent_threads_for_parallel_branch_execution_must_be')}
            isRequired
          >
            <Controller
              name="workflow.parallelMaxConcurrency"
              control={control}
              render={({ field }) => (
                <NumberInput
                  {...numberInputProps}
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

      {/* 6. 文档解析限制 */}
      <AdminSettingSection id="parse" title={t('admin:document_parsing_limits')} showDivider>
        <SimpleGrid columns={[1, 3]} spacing={5}>
          <AdminFormItem
            label={t('admin:file_parse_timeout_seconds_2')}
            tooltip={t('admin:max_processing_time_for_a_worker_to_parse_a_single_document')}
            isRequired
          >
            <Controller
              name="parse.fileTimeoutSeconds"
              control={control}
              render={({ field }) => (
                <NumberInput
                  {...numberInputProps}
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
            label={t('admin:xlsx_max_rows')}
            tooltip={t('admin:max_rows_allowed_when_parsing_excel_spreadsheets')}
            isRequired
          >
            <Controller
              name="parse.xlsxMaxRows"
              control={control}
              render={({ field }) => (
                <NumberInput
                  {...numberInputProps}
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
            label={t('admin:xlsx_max_columns')}
            tooltip={t('admin:max_columns_allowed_when_parsing_excel_spreadsheets')}
            isRequired
          >
            <Controller
              name="parse.xlsxMaxColumns"
              control={control}
              render={({ field }) => (
                <NumberInput
                  {...numberInputProps}
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
            label={t('admin:xlsx_max_cells')}
            tooltip={t('admin:max_total_cells_allowed_when_parsing_excel_spreadsheets')}
            isRequired
          >
            <Controller
              name="parse.xlsxMaxCells"
              control={control}
              render={({ field }) => (
                <NumberInput
                  {...numberInputProps}
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
            label={t('admin:xlsx_max_merged_cells')}
            tooltip={t('admin:max_merged_cells_allowed_when_parsing_excel_spreadsheets')}
            isRequired
          >
            <Controller
              name="parse.xlsxMaxMergedCells"
              control={control}
              render={({ field }) => (
                <NumberInput
                  {...numberInputProps}
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
            label={t('admin:html_conversion_max_characters')}
            tooltip={t('admin:max_characters_allowed_when_converting_html_to_markdown')}
            isRequired
          >
            <Controller
              name="parse.maxHtmlTransformChars"
              control={control}
              render={({ field }) => (
                <NumberInput
                  {...numberInputProps}
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

      {/* 7. 知识库处理并发 */}
      <AdminSettingSection
        id="dataset"
        title={t('admin:dataset_processing_concurrency')}
        showDivider
      >
        <SimpleGrid columns={[1, 3]} spacing={5}>
          <AdminFormItem
            label={t('admin:document_parsing_concurrency_2')}
            tooltip={t('admin:max_parallel_file_parsing_processes_in_the_dataset_queue')}
            isRequired
          >
            <Controller
              name="dataset.parseMaxProcess"
              control={control}
              render={({ field }) => (
                <NumberInput
                  {...numberInputProps}
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
            label={t('admin:vectorization_concurrency')}
            tooltip={t('admin:max_concurrent_embedding_tasks_for_dataset_vectorization')}
            isRequired
          >
            <Controller
              name="dataset.vectorMaxProcess"
              control={control}
              render={({ field }) => (
                <NumberInput
                  {...numberInputProps}
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
            label={t('admin:qa_auto_generation_concurrency')}
            tooltip={t('admin:concurrency_for_auto_qa_pair_splitting_and_generation')}
            isRequired
          >
            <Controller
              name="dataset.qaMaxProcess"
              control={control}
              render={({ field }) => (
                <NumberInput
                  {...numberInputProps}
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
            label={t('admin:multimodal_understanding_concurrency')}
            tooltip={t('admin:max_concurrency_for_vlm_image_understanding_and_description')}
            isRequired
          >
            <Controller
              name="dataset.vlmMaxProcess"
              control={control}
              render={({ field }) => (
                <NumberInput
                  {...numberInputProps}
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

      {/* 8. 向量索引参数 */}
      <AdminSettingSection id="vectorIndex" title={t('admin:vector_index_parameters')} showDivider>
        <SimpleGrid columns={[1, 2]} spacing={5}>
          <AdminFormItem
            label="HNSW ef_search"
            tooltip={t('admin:hnsw_candidate_expansion_factor_controlling_neighbor_search')}
            isRequired
          >
            <Controller
              name="hnswEfSearch"
              control={control}
              render={({ field }) => (
                <NumberInput
                  {...numberInputProps}
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
            label={t('admin:max_scan_rows_hnswmaxscantuples')}
            tooltip={t('admin:max_scanned_rows_for_postgresql_pgvector_search_to_prevent_h')}
            isRequired
          >
            <Controller
              name="hnswMaxScanTuples"
              control={control}
              render={({ field }) => (
                <NumberInput
                  {...numberInputProps}
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

      {/* 9. 对话限流与埋点 */}
      <AdminSettingSection
        id="chatAndTracking"
        title={t('admin:chat_rate_limiting_tracking')}
        showDivider
      >
        <SimpleGrid columns={[1, 2]} spacing={5}>
          <AdminFormItem
            label={t('admin:chat_qpm_limit')}
            tooltip={t('admin:system_wide_chat_requests_per_minute_limit_plan_limits_take')}
            isRequired
          >
            <Controller
              name="chat.maxQpm"
              control={control}
              render={({ field }) => (
                <NumberInput
                  {...numberInputProps}
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

          <AdminFormItem
            label={t('admin:tracking_batch_flush_interval_ms')}
            tooltip={t('admin:buffer_time_for_aggregating_tracking_events_before_writing_t')}
            isRequired
          >
            <Controller
              name="tracking.batchUpdateTime"
              control={control}
              render={({ field }) => (
                <NumberInput
                  {...numberInputProps}
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
            label={t('admin:llm_trace_retention_hours')}
            tooltip={t('admin:retention_period_for_detailed_llm_tracing_logs_hours')}
            isRequired
          >
            <Controller
              name="tracking.retentionHours"
              control={control}
              render={({ field }) => (
                <NumberInput
                  {...numberInputProps}
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

      {/* 10. 流式恢复与保护 */}
      <AdminSettingSection
        id="streamResume"
        title={t('admin:stream_resume_protection')}
        showDivider
      >
        <SimpleGrid columns={[1, 2]} spacing={5}>
          <AdminFormItem
            label={t('admin:stream_session_retention_seconds')}
            tooltip={t('admin:ttl_in_redis_for_resumable_streaming_chats_seconds')}
            isRequired
          >
            <Controller
              name="streamResume.ttlSeconds"
              control={control}
              render={({ field }) => (
                <NumberInput
                  {...numberInputProps}
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
            label={t('admin:retention_after_completion_seconds')}
            tooltip={t('admin:how_long_the_cache_snapshot_stays_available_for_clients_afte')}
            isRequired
          >
            <Controller
              name="streamResume.postCompleteTtlSeconds"
              control={control}
              render={({ field }) => (
                <NumberInput
                  {...numberInputProps}
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
            label={t('admin:redis_max_memory_ratio_2')}
            tooltip={t('admin:max_share_of_redis_maxmemory_the_stream_cache_may_use_0_0_1')}
            isRequired
          >
            <Controller
              name="streamResume.redisMaxmemoryRatio"
              control={control}
              render={({ field }) => (
                <NumberInput
                  {...numberInputProps}
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
            label={t('admin:redis_memory_check_interval_ms_2')}
            tooltip={t('admin:polling_interval_for_checking_the_redis_memory_threshold_ms')}
            isRequired
          >
            <Controller
              name="streamResume.redisMemoryCheckIntervalMs"
              control={control}
              render={({ field }) => (
                <NumberInput
                  {...numberInputProps}
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

      {/* 11. 任务与渠道并发 */}
      <AdminSettingSection
        id="taskAndChannel"
        title={t('admin:task_channel_concurrency')}
        showDivider
      >
        <SimpleGrid columns={[1, 2]} spacing={5}>
          <AdminFormItem
            label={t('admin:evaluation_task_concurrency_limit')}
            tooltip={t('admin:max_concurrency_for_backend_llm_benchmark_evaluation_tasks')}
            isRequired
          >
            <Controller
              name="task.evalConcurrency"
              control={control}
              render={({ field }) => (
                <NumberInput
                  {...numberInputProps}
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
            label={t('admin:official_account_message_concurrency')}
            tooltip={t('admin:max_concurrent_requests_for_the_wechat_official_account_serv')}
            isRequired
          >
            <Controller
              name="channel.wechatConcurrency"
              control={control}
              render={({ field }) => (
                <NumberInput
                  {...numberInputProps}
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

export default React.memo(LimitsSettingComponent);
