import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import React, { useEffect, useMemo } from 'react';
import {
  Input,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  SimpleGrid,
  Box
} from '@chakra-ui/react';
import { useForm, Controller, useWatch } from 'react-hook-form';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { useDomainConfig } from '@/web/common/system/useDomainConfig';
import {
  AdminSettingPage,
  AdminSettingSection,
  AdminFormItem,
  ConnectivityTestInput,
  type SettingTOCItem
} from '@/pageComponents/admin/settings';
import ThirdPartyVariables from '@/pageComponents/admin/config/components/FormField/ThirdPartyVariables';
import type { SystemInstanceConfigDomainMap } from '@fastgpt/global/common/system/config';

type ProvidersConfigForm = SystemInstanceConfigDomainMap['providers'];

const ProvidersSettingComponent = () => {
  const { t } = useClientTranslation('admin');
  const tocItems: SettingTOCItem[] = useMemo(
    () => [
      { id: 'documentParse', label: t('admin:provider_section_doc_parse') },
      { id: 'dataSource', label: t('admin:provider_section_data_source') },
      { id: 'workflowVariables', label: t('admin:provider_section_workflow_vars') }
    ],
    [t]
  );

  const { effectiveConfig, isLoading, isUpdating, updateConfig } = useDomainConfig('providers');

  const { control, handleSubmit, reset, register, setValue } = useForm<ProvidersConfigForm>({
    defaultValues: effectiveConfig
  });

  useEffect(() => {
    if (effectiveConfig && Object.keys(effectiveConfig).length > 0) {
      reset(effectiveConfig);
    }
  }, [effectiveConfig, reset]);

  const documentParseProvider = useWatch({ control, name: 'documentParse.provider' });
  const externalProviderWorkflowVariables = useWatch({
    control,
    name: 'externalProviderWorkflowVariables'
  });

  const onSave = handleSubmit(async (formData) => {
    await updateConfig(formData);
  });

  return (
    <AdminSettingPage
      headerTitle={t('admin:page_title_providers')}
      tocItems={tocItems}
      isLoading={isLoading}
      isSaving={isUpdating}
      onSave={onSave}
    >
      {/* 1. 文档增强解析 */}
      <AdminSettingSection id="documentParse" title={t('admin:provider_section_doc_parse')}>
        <AdminFormItem
          label={t('admin:parsing_provider')}
          tooltip={t('admin:select_the_provider_used_to_parse_hard_formats_such_as_scann')}
          isRequired
          mb={6}
        >
          <Controller
            name="documentParse.provider"
            control={control}
            render={({ field }) => (
              <MySelect
                width={'400px'}
                placeholder={t('admin:select_a_parsing_provider')}
                list={[
                  { label: 'somark', value: 'somark' },
                  { label: 'doc2x', value: 'doc2x' },
                  { label: 'textln', value: 'textln' },
                  { label: t('admin:custom_self_hosted'), value: 'customPdf' },
                  { label: t('admin:sangfor_short'), value: 'sangfor' }
                ]}
                value={
                  field.value === 'textin'
                    ? 'textln'
                    : field.value === 'custom'
                      ? 'customPdf'
                      : field.value
                }
                onChange={field.onChange}
              />
            )}
          />
        </AdminFormItem>

        {documentParseProvider === 'somark' && (
          <Box
            p={5}
            bg={'white'}
            borderRadius={'lg'}
            borderWidth={'1px'}
            borderColor={'myGray.200'}
            mb={6}
          >
            <AdminFormItem
              label="Somark API Key"
              tooltip={t('admin:use_the_official_somark_intelligent_cloud_parsing_credential')}
              isRequired
              mb={0}
            >
              <Input
                type="password"
                {...register('documentParse.customPdf.somarkApiKey')}
                placeholder="******"
              />
            </AdminFormItem>
          </Box>
        )}

        {documentParseProvider === 'doc2x' && (
          <Box
            p={5}
            bg={'white'}
            borderRadius={'lg'}
            borderWidth={'1px'}
            borderColor={'myGray.200'}
            mb={6}
          >
            <AdminFormItem
              label="Doc2X Key"
              tooltip={t('admin:use_the_official_doc2x_layout_recognition_and_table_extracti')}
              isRequired
              mb={0}
            >
              <Input
                type="password"
                {...register('documentParse.customPdf.doc2xKey')}
                placeholder="******"
              />
            </AdminFormItem>
          </Box>
        )}

        {(documentParseProvider === 'textln' || documentParseProvider === 'textin') && (
          <Box
            p={5}
            bg={'white'}
            borderRadius={'lg'}
            borderWidth={'1px'}
            borderColor={'myGray.200'}
            mb={6}
          >
            <SimpleGrid columns={[1, 2]} spacing={5}>
              <AdminFormItem
                label="TextIn AppId"
                tooltip={t('admin:intsig_textin_platform_appid')}
                isRequired
              >
                <Input {...register('documentParse.customPdf.textinAppId')} placeholder="******" />
              </AdminFormItem>

              <AdminFormItem
                label="TextIn Secret Code"
                tooltip={t('admin:intsig_textin_platform_secret_code')}
                isRequired
              >
                <Input
                  type="password"
                  {...register('documentParse.customPdf.textinSecretCode')}
                  placeholder="******"
                />
              </AdminFormItem>
            </SimpleGrid>
          </Box>
        )}

        {(documentParseProvider === 'customPdf' || documentParseProvider === 'custom') && (
          <Box
            p={5}
            bg={'white'}
            borderRadius={'lg'}
            borderWidth={'1px'}
            borderColor={'myGray.200'}
            mb={6}
          >
            <AdminFormItem
              label={t('admin:custom_pdf_parser_service_url')}
              tooltip={t('admin:full_url_of_the_custom_pdf_parsing_service_connectivity_can')}
              isRequired
            >
              <Controller
                name="documentParse.customPdf.url"
                control={control}
                render={({ field }) => (
                  <ConnectivityTestInput
                    {...field}
                    isEditable
                    placeholder="https://pdf-parser.example.com/api"
                  />
                )}
              />
            </AdminFormItem>

            <AdminFormItem
              label={t('admin:custom_parser_auth_key')}
              tooltip={t('admin:bearer_token_used_when_calling_the_custom_parsing_service')}
              mb={0}
            >
              <Input
                type="password"
                {...register('documentParse.customPdf.key')}
                placeholder="******"
              />
            </AdminFormItem>
          </Box>
        )}

        {documentParseProvider === 'sangfor' && (
          <Box
            p={5}
            bg={'white'}
            borderRadius={'lg'}
            borderWidth={'1px'}
            borderColor={'myGray.200'}
            mb={6}
          >
            <AdminFormItem
              label={t('admin:sangfor_parsing_api_endpoint')}
              tooltip={t('admin:sangfor_document_parsing_microservice_url_connectivity_testi')}
              isRequired
            >
              <Controller
                name="documentParse.sangfor.url"
                control={control}
                render={({ field }) => (
                  <ConnectivityTestInput
                    {...field}
                    isEditable
                    placeholder="https://sangfor-parse.example.com"
                  />
                )}
              />
            </AdminFormItem>

            <SimpleGrid columns={[1, 2]} spacing={5}>
              <AdminFormItem
                label={t('admin:sangfor_service_key')}
                tooltip={t('admin:sangfor_service_credential')}
              >
                <Input
                  type="password"
                  {...register('documentParse.sangfor.key')}
                  placeholder="******"
                />
              </AdminFormItem>

              <AdminFormItem
                label={t('admin:supported_file_extensions')}
                tooltip={t('admin:comma_separated_extensions_e_g_pdf_docx')}
              >
                <Input {...register('documentParse.sangfor.extensions')} placeholder="pdf" />
              </AdminFormItem>
            </SimpleGrid>

            <AdminFormItem
              label={t('admin:request_timeout_seconds')}
              tooltip={t('admin:maximum_timeout_limit_default_600_seconds')}
              mb={0}
            >
              <Controller
                name="documentParse.sangfor.timeoutSeconds"
                control={control}
                render={({ field }) => (
                  <NumberInput
                    variant={'whiteOutline'}
                    maxW={'400px'}
                    min={10}
                    max={7200}
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
          </Box>
        )}
      </AdminSettingSection>

      {/* 2. 第三方数据源接入 */}
      <AdminSettingSection
        id="dataSource"
        title={t('admin:provider_section_data_source')}
        showDivider
      >
        <SimpleGrid columns={[1, 2]} spacing={5}>
          <AdminFormItem
            label={t('admin:feishu_platform_url')}
            tooltip={t('admin:data_source_private_tip')}
          >
            <Controller
              name="dataSource.feishuBaseUrl"
              control={control}
              render={({ field }) => (
                <ConnectivityTestInput {...field} isEditable placeholder="https://open.feishu.cn" />
              )}
            />
          </AdminFormItem>

          <AdminFormItem
            label={t('admin:dingtalk_platform_url')}
            tooltip={t('admin:data_source_private_tip')}
          >
            <Controller
              name="dataSource.dingtalkBaseUrl"
              control={control}
              render={({ field }) => (
                <ConnectivityTestInput
                  {...field}
                  isEditable
                  placeholder="https://api.dingtalk.com"
                />
              )}
            />
          </AdminFormItem>

          <AdminFormItem
            label={t('admin:dingtalk_oapi_platform_url')}
            tooltip={t('admin:data_source_private_tip')}
          >
            <Controller
              name="dataSource.dingtalkOapiBaseUrl"
              control={control}
              render={({ field }) => (
                <ConnectivityTestInput
                  {...field}
                  isEditable
                  placeholder="https://oapi.dingtalk.com"
                />
              )}
            />
          </AdminFormItem>

          <AdminFormItem
            label={t('admin:yuque_platform_url')}
            tooltip={t('admin:data_source_private_tip')}
          >
            <Controller
              name="dataSource.yuqueDatasetBaseUrl"
              control={control}
              render={({ field }) => (
                <ConnectivityTestInput {...field} isEditable placeholder="https://www.yuque.com" />
              )}
            />
          </AdminFormItem>
        </SimpleGrid>
      </AdminSettingSection>

      {/* 3. 外部提供商工作流变量 */}
      <AdminSettingSection
        id="workflowVariables"
        title={t('admin:provider_section_workflow_vars')}
        showDivider
      >
        <ThirdPartyVariables
          value={externalProviderWorkflowVariables}
          onChange={(val) =>
            setValue(
              'externalProviderWorkflowVariables',
              val.map((item) => ({ ...item, url: item.url ?? '' }))
            )
          }
          title={t('admin:global_variable_list')}
        />
      </AdminSettingSection>
    </AdminSettingPage>
  );
};

export default React.memo(ProvidersSettingComponent);
