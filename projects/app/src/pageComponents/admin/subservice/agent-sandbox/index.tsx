import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
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
import { useForm, Controller, useWatch, type ControllerRenderProps } from 'react-hook-form';
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
import { isValidServiceBaseUrl } from '@fastgpt/global/common/string/url';
import {
  AgentSandboxProxyConfigSchema,
  AgentSandboxVolumeNamePrefixSchema,
  DEFAULT_SANDBOX_VOLUME_NAME_PREFIX
} from '@fastgpt/global/common/system/config/schemas/subservice';
import type { SystemInstanceConfigDomainMap } from '@fastgpt/global/common/system/config/schema';
import type { DeepPartial } from '@fastgpt/global/common/system/config/type';

type SubserviceConfigForm = SystemInstanceConfigDomainMap['subservice'];

const isValidOptionalUrl = (url?: string) => !url || isValidServiceBaseUrl(url);

const AgentSandboxSubserviceComponent = () => {
  const { t } = useSafeTranslation();
  const { effectiveConfig, isSecretConfigured, isLoading, isUpdating, patchConfig } =
    useDomainConfig('subservice');
  const isOpenSandboxApiKeyConfigured = isSecretConfigured('agentSandbox.opensandbox.apiKey');
  const isVolumeManagerTokenConfigured = isSecretConfigured(
    'agentSandbox.opensandbox.volumeManagerToken'
  );

  const form = useForm<SubserviceConfigForm>({
    defaultValues: effectiveConfig
  });
  const {
    control,
    handleSubmit,
    reset,
    register,
    formState: { errors }
  } = form;

  useEffect(() => {
    if (effectiveConfig && Object.keys(effectiveConfig).length > 0) {
      reset(effectiveConfig);
    }
  }, [effectiveConfig, reset]);

  const enabled =
    useWatch({
      control,
      name: 'agentSandbox.enabled'
    }) ?? false;
  const openSandboxApiKey = useWatch({
    control,
    name: 'agentSandbox.opensandbox.apiKey'
  });
  const volumeManagerToken = useWatch({
    control,
    name: 'agentSandbox.opensandbox.volumeManagerToken'
  });
  const openSandboxRuntime = useWatch({
    control,
    name: 'agentSandbox.opensandbox.runtime'
  });
  const isKubernetesRuntime = enabled && openSandboxRuntime === 'kubernetes';

  const tocItems: SettingTOCItem[] = useMemo(
    () => [
      { id: 'connection', label: t('admin:connection_connectivity') },
      ...(enabled ? [{ id: 'proxy', label: t('admin:sandbox_proxy_settings') }] : []),
      { id: 'specs', label: t('admin:shared_resource_specs') },
      { id: 'lifecycle', label: t('admin:lifecycle_runtime') },
      { id: 'mirrors', label: t('admin:package_mirror_acceleration') }
    ],
    [enabled, t]
  );

  const onSave = handleSubmit(async (formData) => {
    const isEnabled = formData.agentSandbox.enabled;
    const isKubernetesActive =
      isEnabled && formData.agentSandbox.opensandbox.runtime === 'kubernetes';
    // 隐藏的无效数字草稿不能阻断切换运行态或停用服务；可见字段仍由 RHF 与服务端校验。
    const resolveOvercommitFactor = (value: number, previous = 1) =>
      isKubernetesActive || (Number.isFinite(value) && value >= 1) ? value : previous;
    // 关闭服务时隐藏的无效草稿回退到已保存值，允许管理员正常停用。
    const sanitizedAgentSandbox: DeepPartial<SubserviceConfigForm['agentSandbox']> = {
      ...formData.agentSandbox,
      proxy: !isEnabled
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
          isEnabled || isValidOptionalUrl(formData.agentSandbox.opensandbox.baseUrl)
            ? formData.agentSandbox.opensandbox.baseUrl
            : (effectiveConfig.agentSandbox?.opensandbox?.baseUrl ?? ''),
        volumeManagerUrl:
          isEnabled || isValidOptionalUrl(formData.agentSandbox.opensandbox.volumeManagerUrl)
            ? formData.agentSandbox.opensandbox.volumeManagerUrl
            : (effectiveConfig.agentSandbox?.opensandbox?.volumeManagerUrl ?? ''),
        volumeNamePrefix: (() => {
          const parsedPrefix = AgentSandboxVolumeNamePrefixSchema.safeParse(
            formData.agentSandbox.opensandbox.volumeNamePrefix
          );
          if (parsedPrefix.success) return parsedPrefix.data;
          return isEnabled
            ? (formData.agentSandbox.opensandbox.volumeNamePrefix ?? '').trim()
            : (effectiveConfig.agentSandbox?.opensandbox?.volumeNamePrefix ??
                DEFAULT_SANDBOX_VOLUME_NAME_PREFIX);
        })()
      }
    };
    await patchConfig({ agentSandbox: sanitizedAgentSandbox });
  });

  const validateServiceBaseUrl = (value?: string) => {
    if (!value?.trim()) return t('admin:required');
    return isValidServiceBaseUrl(value) || t('admin:invalid_subservice_base_url');
  };

  const validateVolumeNamePrefix = (value?: string) => {
    if (!value?.trim()) return t('admin:required');
    return (
      AgentSandboxVolumeNamePrefixSchema.safeParse(value).success ||
      t('admin:invalid_sandbox_volume_name_prefix')
    );
  };

  const renderServiceProbeGroup = ({
    service,
    field,
    token,
    isTokenConfigured,
    isUrlInvalid,
    tokenRequired,
    urlLabel,
    urlTooltip,
    urlPlaceholder,
    tokenLabel,
    tokenTooltip,
    credential
  }: {
    service: 'opensandbox' | 'volumeManager';
    field: ControllerRenderProps<
      SubserviceConfigForm,
      'agentSandbox.opensandbox.baseUrl' | 'agentSandbox.opensandbox.volumeManagerUrl'
    >;
    token: string | undefined;
    isTokenConfigured: boolean;
    isUrlInvalid: boolean;
    tokenRequired?: boolean;
    urlLabel: string;
    urlTooltip: string;
    urlPlaceholder: string;
    tokenLabel: string;
    tokenTooltip: string;
    credential: React.ReactNode;
  }) => (
    <ConnectivityTestInput
      isInvalid={isUrlInvalid}
      {...field}
      isEditable
      service={service}
      token={token}
      useStoredToken={token === undefined && isTokenConfigured}
      placeholder={urlPlaceholder}
      renderLayout={({ input, button, result }) => (
        <ConnectivityTestGroup
          address={
            <AdminFormItem
              name={field.name}
              label={urlLabel}
              tooltip={urlTooltip}
              isRequired
              mb={4}
            >
              {input}
            </AdminFormItem>
          }
          credential={
            <AdminFormItem
              label={tokenLabel}
              tooltip={tokenTooltip}
              isRequired={tokenRequired}
              mb={4}
            >
              {credential}
            </AdminFormItem>
          }
          button={button}
          result={result}
        />
      )}
    />
  );

  return (
    <AdminSettingPage
      form={form}
      headerTitle={t('admin:page_title_agent_sandbox')}
      tocItems={tocItems}
      isLoading={isLoading}
      isSaving={isUpdating}
      onSave={onSave}
    >
      {/* 1. 连接与连通性 */}
      <AdminSettingSection id="connection" title={t('admin:connection_connectivity')}>
        <Controller
          name="agentSandbox.enabled"
          control={control}
          render={({ field }) => (
            <AdminSwitchRow
              label={t('admin:enable_agent_sandbox')}
              tooltip={t('admin:enable_agent_sandbox_tip')}
              isChecked={field.value}
              onChange={field.onChange}
            />
          )}
        />

        {enabled && (
          <Box mt={6}>
            <Controller
              name="agentSandbox.opensandbox.baseUrl"
              control={control}
              rules={{ validate: validateServiceBaseUrl }}
              render={({ field }) =>
                renderServiceProbeGroup({
                  service: 'opensandbox',
                  field,
                  token: openSandboxApiKey,
                  isTokenConfigured: isOpenSandboxApiKeyConfigured,
                  isUrlInvalid: Boolean(errors.agentSandbox?.opensandbox?.baseUrl),
                  tokenRequired: true,
                  urlLabel: t('admin:opensandbox_service_url'),
                  urlTooltip: t('admin:opensandbox_base_url'),
                  urlPlaceholder: 'http://opensandbox:8080',
                  tokenLabel: 'OpenSandbox API Key',
                  tokenTooltip: t('admin:service_api_auth_key'),
                  credential: (
                    <Controller
                      name="agentSandbox.opensandbox.apiKey"
                      control={control}
                      rules={{
                        validate: (value) =>
                          (value === undefined
                            ? isOpenSandboxApiKeyConfigured
                            : Boolean(value.trim())) || t('admin:required')
                      }}
                      render={({ field }) => (
                        <AdminSecretInput
                          isInvalid={Boolean(errors.agentSandbox?.opensandbox?.apiKey)}
                          name={field.name}
                          value={field.value}
                          onChange={field.onChange}
                          isConfigured={isOpenSandboxApiKeyConfigured}
                          isRequired
                        />
                      )}
                    />
                  )
                })
              }
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
                      isInvalid={Boolean(form.getFieldState(field.name, form.formState).error)}
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
                <Controller
                  name="agentSandbox.opensandbox.image"
                  control={control}
                  rules={{
                    validate: (value) => Boolean(value?.trim()) || t('admin:required')
                  }}
                  render={({ field }) => (
                    <Input
                      isInvalid={Boolean(errors.agentSandbox?.opensandbox?.image)}
                      name={field.name}
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      placeholder="registry.cn-hangzhou.aliyuncs.com/fastgpt/fastgpt-agent-sandbox:v0.5.0"
                    />
                  )}
                />
              </AdminFormItem>

              <SimpleGrid columns={[1, 2]} spacing={5} gridColumn={'1 / -1'}>
                <Controller
                  name="agentSandbox.opensandbox.useServerProxy"
                  control={control}
                  render={({ field }) => (
                    <AdminSwitchRow
                      name={field.name}
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
                        <AdminNumberInput
                          min={1}
                          step={0.1}
                          value={field.value}
                          fallbackValue={1}
                          isInvalid={Boolean(fieldState.error)}
                          onChange={field.onChange}
                        />
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
                        <AdminNumberInput
                          min={1}
                          step={0.1}
                          value={field.value}
                          fallbackValue={1}
                          isInvalid={Boolean(fieldState.error)}
                          onChange={field.onChange}
                        />
                      )}
                    />
                  </AdminFormItem>
                </>
              )}

              <AdminFormItem
                name="agentSandbox.opensandbox.volumeNamePrefix"
                label={t('admin:storage_volume_name_prefix')}
                tooltip={t('admin:dynamic_volume_name_prefix')}
                isRequired
              >
                <Input
                  isInvalid={Boolean(
                    form.getFieldState('agentSandbox.opensandbox.volumeNamePrefix', form.formState)
                      .error
                  )}
                  {...register('agentSandbox.opensandbox.volumeNamePrefix', {
                    validate: validateVolumeNamePrefix
                  })}
                  placeholder={DEFAULT_SANDBOX_VOLUME_NAME_PREFIX}
                />
              </AdminFormItem>
            </SimpleGrid>

            <Controller
              name="agentSandbox.opensandbox.volumeManagerUrl"
              control={control}
              rules={{ validate: validateServiceBaseUrl }}
              render={({ field }) =>
                renderServiceProbeGroup({
                  service: 'volumeManager',
                  field,
                  token: volumeManagerToken,
                  isTokenConfigured: isVolumeManagerTokenConfigured,
                  isUrlInvalid: Boolean(errors.agentSandbox?.opensandbox?.volumeManagerUrl),
                  tokenRequired: true,
                  urlLabel: t('admin:volume_manager_service_url'),
                  urlTooltip: t('admin:volume_manager_microservice_url'),
                  urlPlaceholder: 'http://volume-manager:8081',
                  tokenLabel: t('admin:volume_manager_token'),
                  tokenTooltip: t('admin:volume_manager_credential'),
                  credential: (
                    <Controller
                      name="agentSandbox.opensandbox.volumeManagerToken"
                      control={control}
                      rules={{
                        validate: (value) =>
                          (value === undefined
                            ? isVolumeManagerTokenConfigured
                            : Boolean(value.trim())) || t('admin:required')
                      }}
                      render={({ field }) => (
                        <AdminSecretInput
                          isInvalid={Boolean(errors.agentSandbox?.opensandbox?.volumeManagerToken)}
                          name={field.name}
                          value={field.value}
                          onChange={field.onChange}
                          isConfigured={isVolumeManagerTokenConfigured}
                          isRequired
                        />
                      )}
                    />
                  )
                })
              }
            />
          </Box>
        )}
      </AdminSettingSection>

      {enabled && (
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
                        isRequired
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
                  isInvalid={Boolean(form.getFieldState(field.name, form.formState).error)}
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
                <AdminNumberInput
                  isInvalid={Boolean(form.getFieldState(field.name, form.formState).error)}
                  min={512}
                  max={65536}
                  step={512}
                  precision={0}
                  value={field.value}
                  fallbackValue={2048}
                  onChange={field.onChange}
                />
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
                <AdminNumberInput
                  isInvalid={Boolean(form.getFieldState(field.name, form.formState).error)}
                  min={1}
                  max={200}
                  value={field.value}
                  fallbackValue={1}
                  onChange={field.onChange}
                />
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
                <AdminNumberInput
                  isInvalid={Boolean(form.getFieldState(field.name, form.formState).error)}
                  min={5}
                  max={1440}
                  precision={0}
                  value={field.value}
                  fallbackValue={60}
                  onChange={field.onChange}
                />
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
                <AdminNumberInput
                  isInvalid={Boolean(form.getFieldState(field.name, form.formState).error)}
                  min={1}
                  max={365}
                  precision={0}
                  value={field.value}
                  fallbackValue={7}
                  onChange={field.onChange}
                />
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
                  isInvalid={Boolean(form.getFieldState(field.name, form.formState).error)}
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
                  isInvalid={Boolean(form.getFieldState(field.name, form.formState).error)}
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
              isInvalid={Boolean(
                form.getFieldState('agentSandbox.common.npmRegistry', form.formState).error
              )}
              {...register('agentSandbox.common.npmRegistry')}
              placeholder="https://registry.npmmirror.com"
            />
          </AdminFormItem>

          <AdminFormItem
            label={t('admin:pypi_index_url')}
            tooltip={t('admin:python_index_url_for_pip_install_inside_the_sandbox')}
          >
            <Input
              isInvalid={Boolean(
                form.getFieldState('agentSandbox.common.pypiIndexUrl', form.formState).error
              )}
              {...register('agentSandbox.common.pypiIndexUrl')}
              placeholder="https://pypi.tuna.tsinghua.edu.cn/simple"
            />
          </AdminFormItem>

          <AdminFormItem
            label={t('admin:apt_mirror_url')}
            tooltip={t('admin:apt_mirror_url_for_linux_package_installation')}
          >
            <Input
              isInvalid={Boolean(
                form.getFieldState('agentSandbox.common.aptMirror', form.formState).error
              )}
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
