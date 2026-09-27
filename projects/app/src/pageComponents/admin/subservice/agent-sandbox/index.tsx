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
import { useSystemStore } from '@/web/common/system/useSystemStore';
import {
  AdminSettingPage,
  AdminSettingSection,
  AdminFormItem,
  AdminSwitchRow,
  AdminReadonlyInput,
  ConnectivityTestInput,
  type SettingTOCItem
} from '@/pageComponents/admin/settings';
import type { SystemInstanceConfigDomainMap } from '@fastgpt/global/common/system/config';

type SubserviceConfigForm = SystemInstanceConfigDomainMap['subservice'];

const tocItems: SettingTOCItem[] = [
  { id: 'provider', label: '沙箱 Provider 选择' },
  { id: 'specs', label: '公共资源规格' },
  { id: 'lifecycle', label: '生命周期与运行时' },
  { id: 'mirrors', label: '软件镜像源加速' },
  { id: 'providerConfig', label: 'Provider 专属配置' },
  { id: 'proxy', label: '代理网络拓扑（只读）' }
];

const AgentSandboxSubserviceComponent = () => {
  const { effectiveConfig, isLoading, isUpdating, updateConfig } = useDomainConfig('subservice');
  const { feConfigs } = useSystemStore();

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
    await updateConfig(formData);
  });

  const proxyUrl = (feConfigs as any)?.agentSandboxProxyUrl || 'http://localhost:3006';

  return (
    <AdminSettingPage
      headerTitle={'Agent Sandbox 管理'}
      tocItems={tocItems}
      isLoading={isLoading}
      isSaving={isUpdating}
      onSave={onSave}
    >
      {/* 1. 沙箱 Provider 选择 */}
      <AdminSettingSection id="provider" title="沙箱 Provider 选择">
        <AdminFormItem
          label="当前沙箱 Provider"
          tooltip="选择用于创建与调度 Agent 动态运行环境的代码沙箱集群驱动"
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
                  { label: '未启用 (none)', value: 'none' },
                  { label: 'Sealos Devbox (K8s 原生极速沙箱)', value: 'sealosdevbox' },
                  { label: 'OpenSandbox (通用容器隔离沙箱)', value: 'opensandbox' }
                ]}
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
        </AdminFormItem>
      </AdminSettingSection>

      {/* 2. 公共资源规格 */}
      <AdminSettingSection id="specs" title="公共资源规格" showDivider>
        <SimpleGrid columns={[1, 3]} spacing={5}>
          <AdminFormItem
            label="CPU 核心数 (Core)"
            tooltip="单个沙箱实例分配的最大 CPU 配额"
            isRequired
          >
            <Controller
              name="agentSandbox.common.cpuCount"
              control={control}
              render={({ field }) => (
                <NumberInput
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
            label="内存规格 (MiB)"
            tooltip="单个沙箱实例分配的最大 RAM 内存容量"
            isRequired
          >
            <Controller
              name="agentSandbox.common.memoryMiB"
              control={control}
              render={({ field }) => (
                <NumberInput
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
            label="存储卷大小 (Gi)"
            tooltip="单个沙箱持久化数据存储空间大小"
            isRequired
          >
            <Controller
              name="agentSandbox.common.storageSizeGi"
              control={control}
              render={({ field }) => (
                <NumberInput
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

      {/* 3. 生命周期与运行时 */}
      <AdminSettingSection id="lifecycle" title="生命周期与运行时" showDivider>
        <SimpleGrid columns={[1, 3]} spacing={5}>
          <AdminFormItem
            label="无操作自动挂起 (分钟)"
            tooltip="沙箱空闲超时后自动暂停释放计算资源的时间"
            isRequired
          >
            <Controller
              name="agentSandbox.common.suspendMinutes"
              control={control}
              render={({ field }) => (
                <NumberInput
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
            label="不活跃自动归档 (天)"
            tooltip="长时间未访问沙箱自动归档并释放存储卷的周期"
            isRequired
          >
            <Controller
              name="agentSandbox.common.archiveInactiveDays"
              control={control}
              render={({ field }) => (
                <NumberInput
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
            label="编辑调试实例上限"
            tooltip="单个团队允许同时保持运行的在线编辑调试沙箱最大数量"
            isRequired
          >
            <Controller
              name="agentSandbox.common.maxEditDebug"
              control={control}
              render={({ field }) => (
                <NumberInput
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
            label="容器入口执行超时 (秒)"
            tooltip="启动自定义容器 entrypoint 最长等待时间"
            isRequired
          >
            <Controller
              name="agentSandbox.common.entrypointTimeoutSeconds"
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
            label="WebSocket 消息上限 (Bytes)"
            tooltip="终端与沙箱通信的单次 WebSocket 最大包体大小"
            isRequired
          >
            <Controller
              name="agentSandbox.common.wsMaxMessageBytes"
              control={control}
              render={({ field }) => (
                <NumberInput
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
            label="WebSocket 帧上限 (Bytes)"
            tooltip="WebSocket 传输帧大小上限"
            isRequired
          >
            <Controller
              name="agentSandbox.common.wsMaxFrameBytes"
              control={control}
              render={({ field }) => (
                <NumberInput
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

      {/* 4. 软件镜像源加速 */}
      <AdminSettingSection id="mirrors" title="软件镜像源加速" showDivider>
        <SimpleGrid columns={[1, 3]} spacing={5}>
          <AdminFormItem
            label="npm Registry 源"
            tooltip="沙箱内部安装 Node.js 扩展包时的 npm 镜像地址"
          >
            <Input
              {...register('agentSandbox.common.npmRegistry')}
              placeholder="https://registry.npmmirror.com"
            />
          </AdminFormItem>

          <AdminFormItem
            label="PyPI Index URL"
            tooltip="沙箱内部执行 pip install 时使用的 Python 镜像源"
          >
            <Input
              {...register('agentSandbox.common.pypiIndexUrl')}
              placeholder="https://pypi.tuna.tsinghua.edu.cn/simple"
            />
          </AdminFormItem>

          <AdminFormItem label="APT 镜像源地址" tooltip="Linux 系统软件安装 apt 源地址">
            <Input
              {...register('agentSandbox.common.aptMirror')}
              placeholder="https://mirrors.aliyun.com"
            />
          </AdminFormItem>
        </SimpleGrid>
      </AdminSettingSection>

      {/* 5. Provider 专属配置 */}
      <AdminSettingSection id="providerConfig" title="Provider 专属配置" showDivider>
        {selectedProvider === 'none' && (
          <Box p={5} bg={'myGray.50'} borderRadius={'lg'} color={'myGray.500'} fontSize={'sm'}>
            当前未启用 Agent 沙箱。请在上方选择 Sealos Devbox 或 OpenSandbox 开启环境配置。
          </Box>
        )}

        {selectedProvider === 'sealosdevbox' && (
          <Box p={5} bg={'myGray.50'} borderRadius={'lg'}>
            <AdminFormItem
              label="Sealos Devbox 服务地址"
              tooltip="Sealos Devbox 集群 API 访问端点"
              isRequired
            >
              <Controller
                name="agentSandbox.sealosdevbox.baseUrl"
                control={control}
                render={({ field }) => (
                  <Box>
                    <Input {...field} mb={2} placeholder="https://devbox.cloud.sealos.io" />
                    {field.value && <ConnectivityTestInput url={field.value} />}
                  </Box>
                )}
              />
            </AdminFormItem>

            <SimpleGrid columns={[1, 2]} spacing={5}>
              <AdminFormItem label="Sealos 访问 Token" tooltip="Sealos 平台 API Token" isRequired>
                <Input
                  type="password"
                  {...register('agentSandbox.sealosdevbox.token')}
                  placeholder="******"
                />
              </AdminFormItem>

              <AdminFormItem
                label="默认开发镜像"
                tooltip="沙箱启动时默认拉取的容器基础镜像"
                isRequired
              >
                <Input
                  {...register('agentSandbox.sealosdevbox.image')}
                  placeholder="ghcr.io/labring-actions/devbox:v0.1"
                />
              </AdminFormItem>

              <AdminFormItem label="工作空间工作目录" tooltip="容器挂载默认挂载工作区路径">
                <Input
                  {...register('agentSandbox.sealosdevbox.workDirectory')}
                  placeholder="/home/devbox/workspace"
                />
              </AdminFormItem>
            </SimpleGrid>
          </Box>
        )}

        {selectedProvider === 'opensandbox' && (
          <Box p={5} bg={'myGray.50'} borderRadius={'lg'}>
            <AdminFormItem
              label="OpenSandbox 服务地址"
              tooltip="OpenSandbox 基础服务地址"
              isRequired
            >
              <Controller
                name="agentSandbox.opensandbox.baseUrl"
                control={control}
                render={({ field }) => (
                  <Box>
                    <Input {...field} mb={2} placeholder="http://opensandbox:8080" />
                    {field.value && <ConnectivityTestInput url={field.value} />}
                  </Box>
                )}
              />
            </AdminFormItem>

            <SimpleGrid columns={[1, 2]} spacing={5} mb={4}>
              <AdminFormItem label="OpenSandbox API Key" tooltip="服务接口认证密钥" isRequired>
                <Input
                  type="password"
                  {...register('agentSandbox.opensandbox.apiKey')}
                  placeholder="******"
                />
              </AdminFormItem>

              <AdminFormItem label="底层容器运行时" tooltip="OpenSandbox 执行后端类型" isRequired>
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

              <AdminFormItem label="默认容器镜像" tooltip="默认使用的基础沙箱镜像" isRequired>
                <Input
                  {...register('agentSandbox.opensandbox.image')}
                  placeholder="opensandbox/runtime:latest"
                />
              </AdminFormItem>

              <AdminFormItem label="存储卷名前缀" tooltip="动态卷命名规则前缀">
                <Input
                  {...register('agentSandbox.opensandbox.volumeNamePrefix')}
                  placeholder="fastgpt-session"
                />
              </AdminFormItem>
            </SimpleGrid>

            <AdminFormItem
              label="持久卷管理器地址 (Volume Manager)"
              tooltip="卷管理微服务 URL"
              isRequired
            >
              <Controller
                name="agentSandbox.opensandbox.volumeManagerUrl"
                control={control}
                render={({ field }) => (
                  <Box>
                    <Input {...field} mb={2} placeholder="http://volume-manager:8081" />
                    {field.value && <ConnectivityTestInput url={field.value} />}
                  </Box>
                )}
              />
            </AdminFormItem>

            <SimpleGrid columns={[1, 2]} spacing={5}>
              <AdminFormItem label="卷管理器 Token" tooltip="卷管理器鉴权凭证" isRequired>
                <Input
                  type="password"
                  {...register('agentSandbox.opensandbox.volumeManagerToken')}
                  placeholder="******"
                />
              </AdminFormItem>

              <Box pt={8}>
                <Controller
                  name="agentSandbox.opensandbox.useServerProxy"
                  control={control}
                  render={({ field }) => (
                    <AdminSwitchRow
                      label="使用主站反向代理模式"
                      tooltip="流量经由主站 Proxy 安全隧道透传至沙箱环境"
                      isChecked={field.value}
                      onChange={field.onChange}
                    />
                  )}
                />
              </Box>
            </SimpleGrid>
          </Box>
        )}
      </AdminSettingSection>

      {/* 6. 代理网络拓扑（只读） */}
      <AdminSettingSection id="proxy" title="代理网络拓扑（只读）" showDivider>
        <SimpleGrid columns={[1, 2]} spacing={5}>
          <AdminFormItem
            label="Agent Sandbox 反向代理地址"
            tooltip="通过环境变量 AGENT_SANDBOX_PROXY_URL 注入的主站代理服务"
          >
            <AdminReadonlyInput value={proxyUrl} />
          </AdminFormItem>

          <AdminFormItem label="代理通信信任根" tooltip="跨进程通信安全密钥状态">
            <AdminReadonlyInput value="已通过 AGENT_SANDBOX_PROXY_SECRET 安全配置" />
          </AdminFormItem>
        </SimpleGrid>
      </AdminSettingSection>
    </AdminSettingPage>
  );
};

export default React.memo(AgentSandboxSubserviceComponent);
