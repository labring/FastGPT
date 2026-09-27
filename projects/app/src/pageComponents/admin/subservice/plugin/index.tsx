import React from 'react';
import { Box, SimpleGrid, Badge, HStack, Text } from '@chakra-ui/react';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import {
  AdminSettingPage,
  AdminSettingSection,
  AdminFormItem,
  AdminReadonlyInput,
  ConnectivityTestInput,
  type SettingTOCItem
} from '@/pageComponents/admin/settings';

const tocItems: SettingTOCItem[] = [
  { id: 'connection', label: '连接与状态' },
  { id: 'features', label: '运行时特性' }
];

const PluginSubserviceComponent = () => {
  const { feConfigs } = useSystemStore();

  // 插件服务地址默认通过 Docker/K8s 容器网络互联
  const pluginUrl =
    typeof window !== 'undefined'
      ? `${window.location.protocol}//${window.location.hostname}:3004`
      : 'http://localhost:3004';

  const remoteDebugEnabled = Boolean(feConfigs?.pluginRemoteDebug);

  return (
    <AdminSettingPage headerTitle={'插件服务监控'} tocItems={tocItems}>
      {/* 1. 连接与状态 */}
      <AdminSettingSection id="connection" title="连接与状态">
        <AdminFormItem
          label="插件网关内部服务地址"
          tooltip="插件服务在 Docker / K8s 内部集群的拓扑连接地址（通过环境变量 PLUGIN_BASE_URL 注入）"
          mb={6}
        >
          <ConnectivityTestInput url={pluginUrl} placeholder="http://plugin:3004" />
        </AdminFormItem>

        <SimpleGrid columns={[1, 2]} spacing={5}>
          <AdminFormItem label="网络拓扑模式" tooltip="主站与插件服务之间的内部网络调用方式">
            <AdminReadonlyInput value="容器网络自动互联 (Docker / K8s)" />
          </AdminFormItem>

          <AdminFormItem
            label="启动依赖策略"
            tooltip="服务启动策略：L1 探测降级（探测失败仅产生系统警告日志，不阻断主站启动）"
          >
            <AdminReadonlyInput value="L1 探测降级（高可用容错）" />
          </AdminFormItem>
        </SimpleGrid>
      </AdminSettingSection>

      {/* 2. 运行时特性 */}
      <AdminSettingSection id="features" title="运行时特性" showDivider>
        <SimpleGrid columns={[1, 2]} spacing={5}>
          <AdminFormItem
            label="插件远程调试通道 (Remote Debug)"
            tooltip="指示插件服务当前是否开放了开发者远程调试通道"
          >
            <Box
              p={2.5}
              bg={'myGray.50'}
              borderRadius={'md'}
              borderWidth={'1px'}
              borderColor={'myGray.200'}
            >
              <HStack spacing={2}>
                <Badge colorScheme={remoteDebugEnabled ? 'green' : 'gray'}>
                  {remoteDebugEnabled ? '已就绪 (Ready)' : '未开启 (Disabled)'}
                </Badge>
                <Text fontSize={'xs'} color={'myGray.500'}>
                  {remoteDebugEnabled ? '允许从开发者工作台直接调试' : '生产环境安全加固'}
                </Text>
              </HStack>
            </Box>
          </AdminFormItem>

          <AdminFormItem label="已支持插件类型" tooltip="当前平台支持加载与调用的外部插件生态规范">
            <AdminReadonlyInput value="系统工具插件 / OpenAPI 协议 / MCP 扩展" />
          </AdminFormItem>
        </SimpleGrid>
      </AdminSettingSection>
    </AdminSettingPage>
  );
};

export default React.memo(PluginSubserviceComponent);
