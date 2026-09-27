import React, { useEffect } from 'react';
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
  AdminSwitchRow,
  ConnectivityTestInput,
  type SettingTOCItem
} from '@/pageComponents/admin/settings';
import type { SystemInstanceConfigDomainMap } from '@fastgpt/global/common/system/config';

type ProvidersConfigForm = SystemInstanceConfigDomainMap['providers'];

const tocItems: SettingTOCItem[] = [
  { id: 'documentParse', label: '文档增强解析' },
  { id: 'chunk', label: '智能语义分块' },
  { id: 'crm', label: 'CRM 客户关系' },
  { id: 'dataSource', label: '第三方数据源接入' }
];

const ProvidersSettingComponent = () => {
  const { effectiveConfig, isLoading, isUpdating, updateConfig } = useDomainConfig('providers');

  const { control, handleSubmit, reset, register } = useForm<ProvidersConfigForm>({
    defaultValues: effectiveConfig
  });

  useEffect(() => {
    if (effectiveConfig && Object.keys(effectiveConfig).length > 0) {
      reset(effectiveConfig);
    }
  }, [effectiveConfig, reset]);

  const documentParseProvider = useWatch({ control, name: 'documentParse.provider' });
  const chunkEnabled = useWatch({ control, name: 'chunk.enabled' });
  const crmEnabled = useWatch({ control, name: 'crm.enabled' });

  const onSave = handleSubmit(async (formData) => {
    await updateConfig(formData);
  });

  return (
    <AdminSettingPage
      headerTitle={'外部提供商'}
      tocItems={tocItems}
      isLoading={isLoading}
      isSaving={isUpdating}
      onSave={onSave}
    >
      {/* 1. 文档增强解析 */}
      <AdminSettingSection id="documentParse" title="文档增强解析">
        <AdminFormItem
          label="解析服务提供方"
          tooltip="选择用于解析高难度复杂格式（如扫描版 PDF、复杂表格等）的服务渠道"
          isRequired
          mb={6}
        >
          <Controller
            name="documentParse.provider"
            control={control}
            render={({ field }) => (
              <MySelect<'none' | 'customPdf' | 'sangfor'>
                width={'400px'}
                list={[
                  { label: '系统原生解析 (内置开源链路)', value: 'none' },
                  {
                    label: '自定义/商业 PDF 解析服务 (Somark/Doc2X/TextIn/自建)',
                    value: 'customPdf'
                  },
                  { label: '深信服增强解析服务', value: 'sangfor' }
                ]}
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
        </AdminFormItem>

        {documentParseProvider === 'customPdf' && (
          <Box p={5} bg={'myGray.50'} borderRadius={'lg'} mb={6}>
            <AdminFormItem
              label="自建 PDF 解析服务地址"
              tooltip="自建的 PDF 解析服务完整 URL，输入后可立即执行连通性测试"
            >
              <Controller
                name="documentParse.customPdf.url"
                control={control}
                render={({ field }) => (
                  <Box>
                    <Input {...field} mb={2} placeholder="https://pdf-parser.example.com/api" />
                    {field.value && <ConnectivityTestInput url={field.value} />}
                  </Box>
                )}
              />
            </AdminFormItem>

            <SimpleGrid columns={[1, 2]} spacing={5}>
              <AdminFormItem label="自建服务认证 Key" tooltip="向自建解析服务请求时的 Bearer Token">
                <Input
                  type="password"
                  {...register('documentParse.customPdf.key')}
                  placeholder="******"
                />
              </AdminFormItem>

              <AdminFormItem label="Somark API Key" tooltip="使用 Somark 官方智能云端解析凭证">
                <Input
                  type="password"
                  {...register('documentParse.customPdf.somarkApiKey')}
                  placeholder="******"
                />
              </AdminFormItem>

              <AdminFormItem label="Doc2X Key" tooltip="使用 Doc2X 官方排版识别与表格提取密钥">
                <Input
                  type="password"
                  {...register('documentParse.customPdf.doc2xKey')}
                  placeholder="******"
                />
              </AdminFormItem>

              <AdminFormItem label="TextIn AppId" tooltip="合合信息 TextIn 平台应用 AppId">
                <Input {...register('documentParse.customPdf.textinAppId')} placeholder="******" />
              </AdminFormItem>

              <AdminFormItem
                label="TextIn Secret Code"
                tooltip="合合信息 TextIn 平台应用 Secret Code"
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

        {documentParseProvider === 'sangfor' && (
          <Box p={5} bg={'myGray.50'} borderRadius={'lg'} mb={6}>
            <AdminFormItem
              label="深信服解析接口地址"
              tooltip="深信服文档解析外部微服务地址，支持连通性测试"
              isRequired
            >
              <Controller
                name="documentParse.sangfor.url"
                control={control}
                render={({ field }) => (
                  <Box>
                    <Input {...field} mb={2} placeholder="https://sangfor-parse.example.com" />
                    {field.value && <ConnectivityTestInput url={field.value} />}
                  </Box>
                )}
              />
            </AdminFormItem>

            <SimpleGrid columns={[1, 2]} spacing={5}>
              <AdminFormItem label="深信服服务密钥" tooltip="深信服服务访问凭证">
                <Input
                  type="password"
                  {...register('documentParse.sangfor.key')}
                  placeholder="******"
                />
              </AdminFormItem>

              <AdminFormItem label="支持的格式扩展名" tooltip="逗号分隔的扩展名，例如：pdf,docx">
                <Input {...register('documentParse.sangfor.extensions')} placeholder="pdf" />
              </AdminFormItem>

              <AdminFormItem label="请求超时时间 (秒)" tooltip="最大超时上限，默认 600 秒">
                <Controller
                  name="documentParse.sangfor.timeoutSeconds"
                  control={control}
                  render={({ field }) => (
                    <NumberInput
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
            </SimpleGrid>
          </Box>
        )}
      </AdminSettingSection>

      {/* 2. 智能语义分块 */}
      <AdminSettingSection id="chunk" title="智能语义分块" showDivider>
        <Box mb={5}>
          <Controller
            name="chunk.enabled"
            control={control}
            render={({ field }) => (
              <AdminSwitchRow
                label="启用智能语义分块"
                tooltip="开启后，知识库分块环节将利用外部算法模型进行多层级语义边界智能探测"
                isChecked={field.value}
                onChange={field.onChange}
              />
            )}
          />
        </Box>

        {chunkEnabled && (
          <Box p={5} bg={'myGray.50'} borderRadius={'lg'} mb={6}>
            <AdminFormItem
              label="智能分块服务地址"
              tooltip="分块服务端点 URL，配置后支持连通性测试"
              isRequired
            >
              <Controller
                name="chunk.url"
                control={control}
                render={({ field }) => (
                  <Box>
                    <Input {...field} mb={2} placeholder="https://chunk.example.com" />
                    {field.value && <ConnectivityTestInput url={field.value} />}
                  </Box>
                )}
              />
            </AdminFormItem>

            <SimpleGrid columns={[1, 2]} spacing={5}>
              <AdminFormItem label="服务访问密钥" tooltip="智能分块请求认证密钥" isRequired>
                <Input type="password" {...register('chunk.key')} placeholder="******" />
              </AdminFormItem>

              <AdminFormItem label="超时时长 (分钟)" tooltip="超大文档智能切分处理的最长允许时间">
                <Controller
                  name="chunk.timeoutMinutes"
                  control={control}
                  render={({ field }) => (
                    <NumberInput
                      min={1}
                      max={300}
                      value={field.value ?? 60}
                      onChange={(_, val) => field.onChange(val || 60)}
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
          </Box>
        )}
      </AdminSettingSection>

      {/* 3. CRM 客户关系 */}
      <AdminSettingSection id="crm" title="CRM 客户关系" showDivider>
        <Box mb={5}>
          <Controller
            name="crm.enabled"
            control={control}
            render={({ field }) => (
              <AdminSwitchRow
                label="启用 CRM 归因同步"
                tooltip="开启后，主站将访客注册与线索轨迹实时回传至企业自建或第三方 CRM 系统"
                isChecked={field.value}
                onChange={field.onChange}
              />
            )}
          />
        </Box>

        {crmEnabled && (
          <Box p={5} bg={'myGray.50'} borderRadius={'lg'} mb={6}>
            <AdminFormItem label="CRM API 地址" tooltip="CRM 线索上报端点完整 URL" isRequired>
              <Controller
                name="crm.apiUrl"
                control={control}
                render={({ field }) => (
                  <Box>
                    <Input {...field} mb={2} placeholder="https://crm.example.com/api/leads" />
                    {field.value && <ConnectivityTestInput url={field.value} />}
                  </Box>
                )}
              />
            </AdminFormItem>

            <AdminFormItem label="CRM API Key" tooltip="CRM 接口鉴权密钥" isRequired>
              <Input type="password" {...register('crm.apiKey')} placeholder="******" />
            </AdminFormItem>
          </Box>
        )}
      </AdminSettingSection>

      {/* 4. 第三方数据源接入 */}
      <AdminSettingSection id="dataSource" title="第三方数据源接入" showDivider>
        <SimpleGrid columns={[1, 2]} spacing={5}>
          <AdminFormItem label="飞书开放平台地址" tooltip="飞书 API 根地址">
            <Controller
              name="dataSource.feishuBaseUrl"
              control={control}
              render={({ field }) => (
                <Box>
                  <Input {...field} mb={2} placeholder="https://open.feishu.cn" />
                  {field.value && <ConnectivityTestInput url={field.value} />}
                </Box>
              )}
            />
          </AdminFormItem>

          <AdminFormItem label="钉钉 API 根地址" tooltip="钉钉新版 OpenAPI 根地址">
            <Controller
              name="dataSource.dingtalkBaseUrl"
              control={control}
              render={({ field }) => (
                <Box>
                  <Input {...field} mb={2} placeholder="https://api.dingtalk.com" />
                  {field.value && <ConnectivityTestInput url={field.value} />}
                </Box>
              )}
            />
          </AdminFormItem>

          <AdminFormItem label="钉钉 OAPI 基础地址" tooltip="钉钉历史 OAPI 兼容调用地址">
            <Input
              {...register('dataSource.dingtalkOapiBaseUrl')}
              placeholder="https://oapi.dingtalk.com"
            />
          </AdminFormItem>

          <AdminFormItem label="语雀官方域名" tooltip="语雀知识库导入时的基础站点地址">
            <Input
              {...register('dataSource.yuqueDatasetBaseUrl')}
              placeholder="https://www.yuque.com"
            />
          </AdminFormItem>
        </SimpleGrid>
      </AdminSettingSection>
    </AdminSettingPage>
  );
};

export default React.memo(ProvidersSettingComponent);
