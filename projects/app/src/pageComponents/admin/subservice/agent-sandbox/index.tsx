import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import React, { useEffect } from 'react';
import {
  Input,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  SimpleGrid,
  Box,
  Text
} from '@chakra-ui/react';
import { useForm, Controller, useWatch } from 'react-hook-form';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { useDomainConfig } from '@/web/common/system/useDomainConfig';
import AdminSettingPage from '@/pageComponents/admin/settings/AdminSettingPage';
import AdminSettingSection from '@/pageComponents/admin/settings/AdminSettingSection';
import AdminFormItem from '@/pageComponents/admin/settings/AdminFormItem';
import AdminSecretInput from '@/pageComponents/admin/settings/AdminSecretInput';
import AdminNumberInput from '@/pageComponents/admin/settings/AdminNumberInput';
import AdminSwitchRow from '@/pageComponents/admin/settings/AdminSwitchRow';
import ConnectivityTestInput from '@/pageComponents/admin/settings/ConnectivityTestInput';
import ConnectivityTestGroup from '@/pageComponents/admin/settings/ConnectivityTestGroup';
import type { SettingTOCItem } from '@/pageComponents/admin/settings/AdminSettingTOC';
import { isValidHttpUrl } from '@fastgpt/global/common/string/url';
import { AgentSandboxProxyConfigSchema } from '@fastgpt/global/common/system/config/schemas/subservice';
import type { SystemInstanceConfigDomainMap } from '@fastgpt/global/common/system/config/schema';
import type { DeepPartial } from '@fastgpt/global/common/system/config/type';

type SubserviceConfigForm = SystemInstanceConfigDomainMap['subservice'];

const isValidOptionalUrl = (url?: string) => !url || isValidHttpUrl(url);

const AgentSandboxSubserviceComponent = () => {
  const { t } = useSafeTranslation();
  const { effectiveConfig, isSecretConfigured, isLoading, isUpdating, patchConfig } =
    useDomainConfig('subservice');

  const tocItems: SettingTOCItem[] = [
    { id: 'provider', label: t('admin:sandbox_provider_selection') },
    { id: 'proxy', label: t('admin:sandbox_proxy_settings') },
    { id: 'specs', label: t('admin:shared_resource_specs') },
    { id: 'lifecycle', label: t('admin:lifecycle_runtime') },
    { id: 'mirrors', label: t('admin:package_mirror_acceleration') }
  ];

  const {
    control,
    handleSubmit,
    reset,
    register,
    formState: { errors }
  } = useForm<SubserviceConfigForm>({
    defaultValues: effectiveConfig
  });

  useEffect(() => {
    if (effectiveConfig && Object.keys(effectiveConfig).length > 0) {
      reset(effectiveConfig);
    }
  }, [effectiveConfig, reset]);

  const selectedProvider = useWatch({
    control,
    name: 'agentSandbox.provider'
  });
  const openSandboxRuntime = useWatch({
    control,
    name: 'agentSandbox.opensandbox.runtime'
  });
  const isKubernetesRuntime =
    selectedProvider === 'opensandbox' && openSandboxRuntime === 'kubernetes';

  const isSandboxEnabled = selectedProvider !== 'none';

  const onSave = handleSubmit(async (formData) => {
    const provider = formData.agentSandbox.provider;
    const isSealosActive = provider === 'sealosdevbox';
    const isOpenSandboxActive = provider === 'opensandbox';
    const isKubernetesActive =
      isOpenSandboxActive && formData.agentSandbox.opensandbox.runtime === 'kubernetes';
    // 隐藏的无效数字草稿不能阻断切换运行态或停用服务；可见字段仍由 RHF 与服务端校验。
    const resolveOvercommitFactor = (value: number, previous = 1) =>
      isKubernetesActive || (Number.isFinite(value) && value >= 1) ? value : previous;
    // 非当前激活 Provider 的隐藏分支若残留未填完的草稿 URL，回落到已持久化地址，不阻断切换或关闭。
    const sanitizedAgentSandbox: DeepPartial<SubserviceConfigForm['agentSandbox']> = {
      ...formData.agentSandbox,
      // 关闭服务时隐藏的无效草稿回退到已保存值，允许管理员正常停用。
      proxy:
        provider === 'none'
          ? {
              wsUrl: AgentSandboxProxyConfigSchema.shape.wsUrl.safeParse(
                formData.agentSandbox.proxy.wsUrl
              ).success
                ? formData.agentSandbox.proxy.wsUrl
                : (effectiveConfig.agentSandbox?.proxy.wsUrl ?? ''),
              previewUrl: AgentSandboxProxyConfigSchema.shape.previewUrl.safeParse(
                formData.agentSandbox.proxy.previewUrl
              ).success
                ? formData.agentSandbox.proxy.previewUrl
                : (effectiveConfig.agentSandbox?.proxy.previewUrl ?? ''),
              secret:
                formData.agentSandbox.proxy.secret === undefined ||
                formData.agentSandbox.proxy.secret === '' ||
                formData.agentSandbox.proxy.secret.length >= 32
                  ? formData.agentSandbox.proxy.secret
                  : undefined
            }
          : formData.agentSandbox.proxy,
      sealosdevbox: {
        ...formData.agentSandbox.sealosdevbox,
        baseUrl:
          isSealosActive || isValidOptionalUrl(formData.agentSandbox.sealosdevbox.baseUrl)
            ? formData.agentSandbox.sealosdevbox.baseUrl
            : (effectiveConfig.agentSandbox?.sealosdevbox?.baseUrl ?? '')
      },
      opensandbox: {
        ...formData.agentSandbox.opensandbox,
        cpuOvercommitFactor: resolveOvercommitFactor(
          formData.agentSandbox.opensandbox.cpuOvercommitFactor,
          effectiveConfig.agentSandbox?.opensandbox.cpuOvercommitFactor
        ),
        memoryOvercommitFactor: resolveOvercommitFactor(
          formData.agentSandbox.opensandbox.memoryOvercommitFactor,
          effectiveConfig.agentSandbox?.opensandbox.memoryOvercommitFactor
        ),
        baseUrl:
          isOpenSandboxActive || isValidOptionalUrl(formData.agentSandbox.opensandbox.baseUrl)
            ? formData.agentSandbox.opensandbox.baseUrl
            : (effectiveConfig.agentSandbox?.opensandbox?.baseUrl ?? ''),
        volumeManagerUrl:
          isOpenSandboxActive ||
          isValidOptionalUrl(formData.agentSandbox.opensandbox.volumeManagerUrl)
            ? formData.agentSandbox.opensandbox.volumeManagerUrl
            : (effectiveConfig.agentSandbox?.opensandbox?.volumeManagerUrl ?? '')
      }
    };
    await patchConfig({ agentSandbox: sanitizedAgentSandbox });
  });

  return (
    <AdminSettingPage
      headerTitle={t('admin:page_title_agent_sandbox')}
      tocItems={tocItems.filter(({ id }) => id !== 'proxy' || isSandboxEnabled)}
      isLoading={isLoading}
      isSaving={isUpdating}
      onSave={onSave}
    >
      {/* 1. 沙箱 Provider 选择 */}
      <AdminSettingSection id="provider" title={t('admin:sandbox_provider_selection')}>
        <AdminFormItem
          label={t('admin:current_sandbox_provider')}
          tooltip={t('admin:select_the_code_sandbox_cluster_driver_used_to_create_and_sc')}
          isRequired
          mb={6}
        >
          <Controller
            name="agentSandbox.provider"
            control={control}
            render={({ field }) => (
              <MySelect<'none' | 'sealosdevbox' | 'opensandbox'>
                width={'400px'}
                list={[
                  { label: t('admin:disabled_none'), value: 'none' },
                  {
                    label: t('admin:sealos_devbox_k8s_native_fast_sandbox'),
                    value: 'sealosdevbox'
                  },
                  {
                    label: t('admin:opensandbox_general_container_isolated_sandbox'),
                    value: 'opensandbox'
                  }
                ]}
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
        </AdminFormItem>

        {/* 当前 Provider 配置卡片直接跟随选择器。 */}
        {selectedProvider === 'none' && (
          <Box
            p={5}
            bg={'white'}
            borderRadius={'lg'}
            borderWidth={'1px'}
            borderColor={'myGray.200'}
            color={'myGray.500'}
            fontSize={'sm'}
          >
            {t('admin:agent_sandbox_is_not_enabled_select_sealos_devbox_or_opensan')}
          </Box>
        )}

        {selectedProvider === 'sealosdevbox' && (
          <Box
            p={5}
            bg={'white'}
            borderRadius={'lg'}
            borderWidth={'1px'}
            borderColor={'myGray.200'}
          >
            <Controller
              name="agentSandbox.sealosdevbox.baseUrl"
              control={control}
              render={({ field }) => (
                <ConnectivityTestInput
                  {...field}
                  isEditable
                  placeholder="https://devbox.cloud.sealos.io"
                  renderLayout={({ input, button, result }) => (
                    <ConnectivityTestGroup
                      address={
                        <AdminFormItem
                          label={t('admin:sealos_devbox_service_url')}
                          tooltip={t('admin:sealos_devbox_cluster_api_endpoint')}
                          isRequired
                          mb={4}
                        >
                          {input}
                        </AdminFormItem>
                      }
                      credential={
                        <AdminFormItem
                          label={t('admin:sealos_access_token')}
                          tooltip={t('admin:sealos_platform_api_token')}
                          isRequired
                          mb={4}
                        >
                          <Controller
                            name="agentSandbox.sealosdevbox.token"
                            control={control}
                            render={({ field }) => (
                              <AdminSecretInput
                                name={field.name}
                                value={field.value}
                                onChange={field.onChange}
                                isConfigured={isSecretConfigured('agentSandbox.sealosdevbox.token')}
                              />
                            )}
                          />
                        </AdminFormItem>
                      }
                      button={button}
                      result={result}
                    />
                  )}
                />
              )}
            />

            <SimpleGrid columns={[1, 2]} spacing={5}>
              <AdminFormItem
                label={t('admin:default_development_image')}
                tooltip={t('admin:default_base_container_image_pulled_at_sandbox_startup')}
                isRequired
              >
                <Input
                  {...register('agentSandbox.sealosdevbox.image')}
                  placeholder="ghcr.io/labring-actions/devbox:v0.1"
                />
              </AdminFormItem>

              <AdminFormItem
                label={t('admin:workspace_working_directory')}
                tooltip={t('admin:default_workspace_mount_path_in_the_container')}
              >
                <Input
                  {...register('agentSandbox.sealosdevbox.workDirectory')}
                  placeholder="/home/devbox/workspace"
                />
              </AdminFormItem>
            </SimpleGrid>
          </Box>
        )}

        {selectedProvider === 'opensandbox' && (
          <Box
            p={5}
            bg={'white'}
            borderRadius={'lg'}
            borderWidth={'1px'}
            borderColor={'myGray.200'}
          >
            <Controller
              name="agentSandbox.opensandbox.baseUrl"
              control={control}
              render={({ field }) => (
                <ConnectivityTestInput
                  {...field}
                  isEditable
                  placeholder="http://opensandbox:8080"
                  renderLayout={({ input, button, result }) => (
                    <ConnectivityTestGroup
                      address={
                        <AdminFormItem
                          label={t('admin:opensandbox_service_url')}
                          tooltip={t('admin:opensandbox_base_url')}
                          isRequired
                          mb={4}
                        >
                          {input}
                        </AdminFormItem>
                      }
                      credential={
                        <AdminFormItem
                          label={'OpenSandbox API Key'}
                          tooltip={t('admin:service_api_auth_key')}
                          isRequired
                          mb={4}
                        >
                          <Controller
                            name="agentSandbox.opensandbox.apiKey"
                            control={control}
                            render={({ field }) => (
                              <AdminSecretInput
                                name={field.name}
                                value={field.value}
                                onChange={field.onChange}
                                isConfigured={isSecretConfigured('agentSandbox.opensandbox.apiKey')}
                              />
                            )}
                          />
                        </AdminFormItem>
                      }
                      button={button}
                      result={result}
                    />
                  )}
                />
              )}
            />

            <SimpleGrid columns={[1, 2]} spacing={5} mb={4}>
              <AdminFormItem
                label={t('admin:container_runtime')}
                tooltip={t('admin:opensandbox_runtime_backend')}
                isRequired
              >
                <Controller
                  name="agentSandbox.opensandbox.runtime"
                  control={control}
                  render={({ field }) => (
                    <MySelect<'docker' | 'kubernetes'>
                      list={[
                        { label: 'Docker', value: 'docker' },
                        { label: 'Kubernetes (K8s)', value: 'kubernetes' }
                      ]}
                      value={field.value}
                      onChange={field.onChange}
                    />
                  )}
                />
              </AdminFormItem>

              <AdminFormItem
                label={t('admin:default_container_image')}
                tooltip={t('admin:default_base_sandbox_image')}
                isRequired
              >
                <Input
                  {...register('agentSandbox.opensandbox.image')}
                  placeholder="opensandbox/runtime:latest"
                />
              </AdminFormItem>

              <SimpleGrid columns={[1, 2]} spacing={5} gridColumn={'1 / -1'}>
                <Controller
                  name="agentSandbox.opensandbox.useServerProxy"
                  control={control}
                  render={({ field }) => (
                    <AdminSwitchRow
                      label={t('admin:use_reverse_proxy_mode')}
                      tooltip={t(
                        'admin:traffic_is_tunneled_to_the_sandbox_through_the_main_site_pro'
                      )}
                      isChecked={field.value}
                      onChange={field.onChange}
                    />
                  )}
                />
              </SimpleGrid>

              {isKubernetesRuntime && (
                <>
                  <AdminFormItem
                    label={t('admin:sandbox_cpu_overcommit_factor')}
                    tooltip={t('admin:sandbox_cpu_overcommit_factor_tooltip')}
                    isRequired
                  >
                    <Controller
                      name="agentSandbox.opensandbox.cpuOvercommitFactor"
                      control={control}
                      rules={{ validate: (value) => Number.isFinite(value) && value >= 1 }}
                      render={({ field, fieldState }) => (
                        <NumberInput
                          min={1}
                          step={0.1}
                          value={field.value ?? ''}
                          isInvalid={Boolean(fieldState.error)}
                          onChange={(_, value) => field.onChange(value)}
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
                    label={t('admin:sandbox_memory_overcommit_factor')}
                    tooltip={t('admin:sandbox_memory_overcommit_factor_tooltip')}
                    isRequired
                  >
                    <Controller
                      name="agentSandbox.opensandbox.memoryOvercommitFactor"
                      control={control}
                      rules={{ validate: (value) => Number.isFinite(value) && value >= 1 }}
                      render={({ field, fieldState }) => (
                        <NumberInput
                          min={1}
                          step={0.1}
                          value={field.value ?? ''}
                          isInvalid={Boolean(fieldState.error)}
                          onChange={(_, value) => field.onChange(value)}
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
                </>
              )}

              <AdminFormItem
                label={t('admin:storage_volume_name_prefix')}
                tooltip={t('admin:dynamic_volume_name_prefix')}
              >
                <Input
                  {...register('agentSandbox.opensandbox.volumeNamePrefix')}
                  placeholder="fastgpt-session"
                />
              </AdminFormItem>
            </SimpleGrid>

            <Controller
              name="agentSandbox.opensandbox.volumeManagerUrl"
              control={control}
              render={({ field }) => (
                <ConnectivityTestInput
                  {...field}
                  isEditable
                  placeholder="http://volume-manager:8081"
                  testPath="/health"
                  renderLayout={({ input, button, result }) => (
                    <ConnectivityTestGroup
                      address={
                        <AdminFormItem
                          label={t('admin:volume_manager_service_url')}
                          tooltip={t('admin:volume_manager_microservice_url')}
                          isRequired
                          mb={4}
                        >
                          {input}
                        </AdminFormItem>
                      }
                      credential={
                        <AdminFormItem
                          label={t('admin:volume_manager_token')}
                          tooltip={t('admin:volume_manager_credential')}
                          isRequired
                          mb={4}
                        >
                          <Controller
                            name="agentSandbox.opensandbox.volumeManagerToken"
                            control={control}
                            render={({ field }) => (
                              <AdminSecretInput
                                name={field.name}
                                value={field.value}
                                onChange={field.onChange}
                                isConfigured={isSecretConfigured(
                                  'agentSandbox.opensandbox.volumeManagerToken'
                                )}
                              />
                            )}
                          />
                        </AdminFormItem>
                      }
                      button={button}
                      result={result}
                    />
                  )}
                />
              )}
            />
          </Box>
        )}
      </AdminSettingSection>

      {isSandboxEnabled && (
        <AdminSettingSection id="proxy" title={t('admin:sandbox_proxy_settings')} showDivider>
          {(['wsUrl', 'previewUrl', 'secret'] as const).map((key) => {
            const isSecret = key === 'secret';
            const error = errors.agentSandbox?.proxy?.[key];
            return (
              <AdminFormItem
                key={key}
                label={
                  key === 'wsUrl'
                    ? t('admin:sandbox_proxy_ws_url')
                    : key === 'previewUrl'
                      ? t('admin:sandbox_proxy_preview_url')
                      : t('admin:sandbox_proxy_secret')
                }
                tooltip={isSecret ? t('admin:sandbox_proxy_secret_tip') : undefined}
                isRequired
              >
                <Controller
                  name={`agentSandbox.proxy.${key}`}
                  control={control}
                  rules={{
                    validate: (value) => {
                      if (!isSandboxEnabled) return true;
                      if (isSecret) {
                        if (
                          value === undefined &&
                          isSecretConfigured('agentSandbox.proxy.secret')
                        ) {
                          return true;
                        }
                        if (!value) return t('admin:required');
                        return value.length >= 32 || t('admin:sandbox_proxy_secret_invalid');
                      }
                      if (!value) return t('admin:required');
                      return (
                        AgentSandboxProxyConfigSchema.shape[
                          key === 'wsUrl' ? 'wsUrl' : 'previewUrl'
                        ].safeParse(value).success || t('admin:sandbox_proxy_url_invalid')
                      );
                    }
                  }}
                  render={({ field }) =>
                    isSecret ? (
                      <AdminSecretInput
                        name={field.name}
                        value={field.value}
                        onChange={field.onChange}
                        isConfigured={isSecretConfigured('agentSandbox.proxy.secret')}
                        isInvalid={Boolean(error)}
                      />
                    ) : (
                      <ConnectivityTestInput
                        {...field}
                        isEditable
                        service={
                          key === 'wsUrl' ? 'agentSandboxWsProxy' : 'agentSandboxPreviewProxy'
                        }
                        type="text"
                        autoComplete="off"
                        isInvalid={Boolean(error)}
                        placeholder={
                          key === 'wsUrl'
                            ? 'wss://sandbox-proxy.example.com'
                            : 'https://sandbox-proxy.example.com'
                        }
                      />
                    )
                  }
                />
                {error && (
                  <Text color={'red.500'} fontSize={'xs'} mt={1}>
                    {error.message}
                  </Text>
                )}
              </AdminFormItem>
            );
          })}
        </AdminSettingSection>
      )}

      {/* 3. 公共资源规格 */}
      <AdminSettingSection id="specs" title={t('admin:shared_resource_specs')} showDivider>
        <SimpleGrid columns={[1, 3]} spacing={5}>
          <AdminFormItem
            label={t('admin:cpu_cores_core')}
            tooltip={t('admin:max_cpu_quota_per_sandbox_instance')}
            isRequired
          >
            <Controller
              name="agentSandbox.common.cpuCount"
              control={control}
              render={({ field }) => (
                <AdminNumberInput
                  min={0.5}
                  max={32}
                  step={0.5}
                  value={field.value}
                  fallbackValue={1}
                  onChange={field.onChange}
                />
              )}
            />
          </AdminFormItem>

          <AdminFormItem
            label={t('admin:memory_mib')}
            tooltip={t('admin:max_ram_per_sandbox_instance')}
            isRequired
          >
            <Controller
              name="agentSandbox.common.memoryMiB"
              control={control}
              render={({ field }) => (
                <NumberInput
                  variant={'whiteOutline'}
                  min={512}
                  max={65536}
                  step={512}
                  value={field.value ?? 2048}
                  onChange={(_, val) => field.onChange(val || 2048)}
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
            label={t('admin:storage_volume_size_gi')}
            tooltip={t('admin:persistent_storage_size_per_sandbox')}
            isRequired
          >
            <Controller
              name="agentSandbox.common.storageSizeGi"
              control={control}
              render={({ field }) => (
                <NumberInput
                  variant={'whiteOutline'}
                  min={1}
                  max={200}
                  value={field.value ?? 1}
                  onChange={(_, val) => field.onChange(val || 1)}
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

      {/* 4. 生命周期与运行时 */}
      <AdminSettingSection id="lifecycle" title={t('admin:lifecycle_runtime')} showDivider>
        <SimpleGrid columns={[1, 3]} spacing={5}>
          <AdminFormItem
            label={t('admin:auto_suspend_when_idle_minutes')}
            tooltip={t('admin:time_before_an_idle_sandbox_is_auto_suspended_to_release_com')}
            isRequired
          >
            <Controller
              name="agentSandbox.common.suspendMinutes"
              control={control}
              render={({ field }) => (
                <NumberInput
                  variant={'whiteOutline'}
                  min={5}
                  max={1440}
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

          <AdminFormItem
            label={t('admin:auto_archive_after_inactivity_days')}
            tooltip={t('admin:period_after_which_an_unused_sandbox_is_auto_archived_and_it')}
            isRequired
          >
            <Controller
              name="agentSandbox.common.archiveInactiveDays"
              control={control}
              render={({ field }) => (
                <NumberInput
                  variant={'whiteOutline'}
                  min={1}
                  max={365}
                  value={field.value ?? 7}
                  onChange={(_, val) => field.onChange(val || 7)}
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
            label={t('admin:max_debug_editing_instances')}
            tooltip={t('admin:max_online_debugging_sandboxes_a_team_can_keep_running_at_on')}
            isRequired
          >
            <Controller
              name="agentSandbox.common.maxEditDebug"
              control={control}
              render={({ field }) => (
                <AdminNumberInput
                  min={0}
                  max={500}
                  precision={0}
                  value={field.value}
                  fallbackValue={100}
                  onChange={field.onChange}
                />
              )}
            />
          </AdminFormItem>

          <AdminFormItem
            label={t('admin:max_sandbox_instances_per_team')}
            tooltip={t('admin:max_sandbox_instances_per_team_tip')}
          >
            <Controller
              name="agentSandbox.common.maxPerTeam"
              control={control}
              render={({ field }) => (
                <NumberInput
                  variant={'whiteOutline'}
                  min={1}
                  max={100000}
                  precision={0}
                  value={field.value ?? ''}
                  onChange={(valueAsString, val) =>
                    // 清空时必须显式写入 null（不限制），undefined 会被深合并忽略而无法清除旧配额
                    field.onChange(valueAsString.trim() === '' || Number.isNaN(val) ? null : val)
                  }
                >
                  <NumberInputField placeholder={t('admin:unlimited')} />
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

      {/* 5. 软件镜像源加速 */}
      <AdminSettingSection id="mirrors" title={t('admin:package_mirror_acceleration')} showDivider>
        <SimpleGrid columns={[1, 3]} spacing={5}>
          <AdminFormItem
            label={t('admin:npm_registry_url_2')}
            tooltip={t('admin:npm_mirror_url_for_installing_node_js_packages_inside_the_sa')}
          >
            <Input
              {...register('agentSandbox.common.npmRegistry')}
              placeholder="https://registry.npmmirror.com"
            />
          </AdminFormItem>

          <AdminFormItem
            label={t('admin:pypi_index_url')}
            tooltip={t('admin:python_index_url_for_pip_install_inside_the_sandbox')}
          >
            <Input
              {...register('agentSandbox.common.pypiIndexUrl')}
              placeholder="https://pypi.tuna.tsinghua.edu.cn/simple"
            />
          </AdminFormItem>

          <AdminFormItem
            label={t('admin:apt_mirror_url')}
            tooltip={t('admin:apt_mirror_url_for_linux_package_installation')}
          >
            <Input
              {...register('agentSandbox.common.aptMirror')}
              placeholder="https://mirrors.aliyun.com"
            />
          </AdminFormItem>
        </SimpleGrid>
      </AdminSettingSection>
    </AdminSettingPage>
  );
};

export default React.memo(AgentSandboxSubserviceComponent);
