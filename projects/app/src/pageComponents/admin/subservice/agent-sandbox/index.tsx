import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
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

type SubserviceConfigForm = SystemInstanceConfigDomainMap['subservice'];

const AgentSandboxSubserviceComponent = () => {
  const { t } = useClientTranslation('admin');
  const { effectiveConfig, isLoading, isUpdating, patchConfig } = useDomainConfig('subservice');

  const tocItems: SettingTOCItem[] = [
    { id: 'provider', label: t('admin:sandbox_provider_selection') },
    { id: 'providerConfig', label: t('admin:provider_settings') },
    { id: 'specs', label: t('admin:shared_resource_specs') },
    { id: 'lifecycle', label: t('admin:lifecycle_runtime') },
    { id: 'mirrors', label: t('admin:package_mirror_acceleration') },
    { id: 'proxy', label: t('admin:proxy_network_settings') }
  ];

  const { control, handleSubmit, reset, register } = useForm<SubserviceConfigForm>({
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

  const onSave = handleSubmit(async (formData) => {
    await patchConfig({ agentSandbox: formData.agentSandbox });
  });

  return (
    <AdminSettingPage
      headerTitle={t('admin:page_title_agent_sandbox')}
      tocItems={tocItems}
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
      </AdminSettingSection>

      {/* 2. Provider 专属配置 */}
      <AdminSettingSection id="providerConfig" title={t('admin:provider_settings')} showDivider>
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
            <AdminFormItem
              label={t('admin:sealos_devbox_service_url')}
              tooltip={t('admin:sealos_devbox_cluster_api_endpoint')}
              isRequired
            >
              <Controller
                name="agentSandbox.sealosdevbox.baseUrl"
                control={control}
                render={({ field }) => (
                  <ConnectivityTestInput
                    {...field}
                    isEditable
                    placeholder="https://devbox.cloud.sealos.io"
                  />
                )}
              />
            </AdminFormItem>

            <SimpleGrid columns={[1, 2]} spacing={5}>
              <AdminFormItem
                label={t('admin:sealos_access_token')}
                tooltip={t('admin:sealos_platform_api_token')}
                isRequired
              >
                <Input
                  type="password"
                  {...register('agentSandbox.sealosdevbox.token')}
                  placeholder="******"
                />
              </AdminFormItem>

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
            <AdminFormItem
              label={t('admin:opensandbox_service_url')}
              tooltip={t('admin:opensandbox_base_url')}
              isRequired
            >
              <Controller
                name="agentSandbox.opensandbox.baseUrl"
                control={control}
                render={({ field }) => (
                  <ConnectivityTestInput
                    {...field}
                    isEditable
                    placeholder="http://opensandbox:8080"
                  />
                )}
              />
            </AdminFormItem>

            <SimpleGrid columns={[1, 2]} spacing={5} mb={4}>
              <AdminFormItem
                label="OpenSandbox API Key"
                tooltip={t('admin:service_api_auth_key')}
                isRequired
              >
                <Input
                  type="password"
                  {...register('agentSandbox.opensandbox.apiKey')}
                  placeholder="******"
                />
              </AdminFormItem>

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

            <AdminFormItem
              label={t('admin:volume_manager_service_url')}
              tooltip={t('admin:volume_manager_microservice_url')}
              isRequired
            >
              <Controller
                name="agentSandbox.opensandbox.volumeManagerUrl"
                control={control}
                render={({ field }) => (
                  <ConnectivityTestInput
                    {...field}
                    isEditable
                    testPath="/health"
                    placeholder="http://volume-manager:8081"
                  />
                )}
              />
            </AdminFormItem>

            <AdminFormItem
              label={t('admin:volume_manager_token')}
              tooltip={t('admin:volume_manager_credential')}
              isRequired
            >
              <Input
                type="password"
                {...register('agentSandbox.opensandbox.volumeManagerToken')}
                placeholder="******"
              />
            </AdminFormItem>

            <Controller
              name="agentSandbox.opensandbox.useServerProxy"
              control={control}
              render={({ field }) => (
                <AdminSwitchRow
                  label={t('admin:use_reverse_proxy_mode')}
                  tooltip={t('admin:traffic_is_tunneled_to_the_sandbox_through_the_main_site_pro')}
                  isChecked={field.value}
                  onChange={field.onChange}
                />
              )}
            />
          </Box>
        )}
      </AdminSettingSection>

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
                <NumberInput
                  variant={'whiteOutline'}
                  min={0.5}
                  max={32}
                  step={0.5}
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
                <NumberInput
                  variant={'whiteOutline'}
                  min={1}
                  max={500}
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
            label={t('admin:container_entrypoint_timeout_seconds')}
            tooltip={t('admin:max_wait_time_for_a_custom_container_entrypoint')}
            isRequired
          >
            <Controller
              name="agentSandbox.common.entrypointTimeoutSeconds"
              control={control}
              render={({ field }) => (
                <NumberInput
                  variant={'whiteOutline'}
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
            label={t('admin:websocket_message_limit_bytes')}
            tooltip={t('admin:max_single_websocket_package_size_between_the_terminal_and_t')}
            isRequired
          >
            <Controller
              name="agentSandbox.common.wsMaxMessageBytes"
              control={control}
              render={({ field }) => (
                <NumberInput
                  variant={'whiteOutline'}
                  min={1024 * 1024}
                  max={512 * 1024 * 1024}
                  value={field.value ?? 64 * 1024 * 1024}
                  onChange={(_, val) => field.onChange(val || 64 * 1024 * 1024)}
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
            label={t('admin:websocket_frame_limit_bytes')}
            tooltip={t('admin:websocket_max_frame_size')}
            isRequired
          >
            <Controller
              name="agentSandbox.common.wsMaxFrameBytes"
              control={control}
              render={({ field }) => (
                <NumberInput
                  variant={'whiteOutline'}
                  min={1024 * 1024}
                  max={128 * 1024 * 1024}
                  value={field.value ?? 16 * 1024 * 1024}
                  onChange={(_, val) => field.onChange(val || 16 * 1024 * 1024)}
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

      {/* 6. 代理网络配置 */}
      <AdminSettingSection id="proxy" title={t('admin:proxy_network_settings')} showDivider>
        <SimpleGrid columns={[1, 2]} spacing={5}>
          <AdminFormItem
            label={t('admin:websocket_reverse_proxy_url_ws_wss')}
            tooltip={t('admin:websocket_proxy_endpoint_for_agent_sandbox_terminal_sessions')}
          >
            <Input {...register('agentSandbox.proxy.wsUrl')} placeholder="ws://localhost:3006" />
          </AdminFormItem>

          <AdminFormItem
            label={t('admin:http_preview_reverse_proxy_url_http_https')}
            tooltip={t('admin:http_proxy_endpoint_for_agent_sandbox_page_preview_and_stati')}
          >
            <Input
              {...register('agentSandbox.proxy.httpUrl')}
              placeholder="http://localhost:3006"
            />
          </AdminFormItem>
        </SimpleGrid>
      </AdminSettingSection>
    </AdminSettingPage>
  );
};

export default React.memo(AgentSandboxSubserviceComponent);
