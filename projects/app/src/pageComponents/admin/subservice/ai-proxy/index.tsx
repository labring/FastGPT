import React from 'react';
import { SimpleGrid, Box, Text } from '@chakra-ui/react';
import {
  AdminSettingPage,
  AdminSettingSection,
  AdminFormItem,
  AdminReadonlyInput,
  ConnectivityTestInput,
  type SettingTOCItem
} from '@/pageComponents/admin/settings';

const tocItems: SettingTOCItem[] = [
  { id: 'connection', label: '连接与连通性' },
  { id: 'channels', label: '模型聚合通道' }
];

const AiProxySubserviceComponent = () => {
  const aiProxyUrl =
    typeof window !== 'undefined'
      ? `${window.location.protocol}//${window.location.hostname}:3000`
      : 'http://localhost:3000';

  return (
    <AdminSettingPage headerTitle={'AI Proxy 监控'} tocItems={tocItems}>
      {/* 1. 连接与连通性 */}
      <AdminSettingSection id="connection" title="连接与连通性">
        <AdminFormItem
          label="AI Proxy 内部中继端点"
          tooltip="主站调用上游模型聚合分发代理的端点 URL（由环境变量 AIPROXY_API_ENDPOINT 注入）"
          mb={6}
        >
          <ConnectivityTestInput url={aiProxyUrl} placeholder="http://aiproxy:3000" />
        </AdminFormItem>

        <SimpleGrid columns={[1, 2]} spacing={5}>
          <AdminFormItem label="服务架构角色" tooltip="AI Proxy 在整体拓扑中的职责">
            <AdminReadonlyInput value="LLM 统一中继分发网关" />
          </AdminFormItem>

          <AdminFormItem label="容错与熔断机制" tooltip="代理端点不可达或超时时的处理规则">
            <AdminReadonlyInput value="多渠道智能轮询与重试降级" />
          </AdminFormItem>
        </SimpleGrid>
      </AdminSettingSection>

      {/* 2. 模型聚合通道 */}
      <AdminSettingSection id="channels" title="模型聚合通道" showDivider>
        <Box
          p={5}
          bg={'myGray.50'}
          borderRadius={'lg'}
          borderWidth={'1px'}
          borderColor={'myGray.200'}
        >
          <Text fontSize={'sm'} fontWeight={'medium'} color={'myGray.800'} mb={2}>
            多渠道模型中继调度
          </Text>
          <Text fontSize={'xs'} color={'myGray.500'} lineHeight={1.8}>
            AI Proxy 负责聚合全球主流大模型服务商（OpenAI, Claude, 智谱, 阿里百炼, DeepSeek,
            百度千帆, 硅基流动等）。 主站通过统一的 Token 鉴权向 AI Proxy
            发起推理请求，具体模型上游密钥、渠道限流与权重调度在 AI Proxy 网关中统一维护。
          </Text>
        </Box>
      </AdminSettingSection>
    </AdminSettingPage>
  );
};

export default React.memo(AiProxySubserviceComponent);
