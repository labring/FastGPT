import React from 'react';
import { SimpleGrid, Box, Wrap, Tag } from '@chakra-ui/react';
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
  { id: 'specs', label: '沙箱容器安全配额' },
  { id: 'modules', label: '运行时模块支持' }
];

const pythonBuiltins = [
  'math',
  'json',
  'datetime',
  're',
  'random',
  'hashlib',
  'collections',
  'requests',
  'numpy',
  'pandas'
];
const nodeBuiltins = ['crypto', 'path', 'url', 'lodash', 'dayjs', 'axios', 'qs'];

const CodeSandboxSubserviceComponent = () => {
  const sandboxUrl =
    typeof window !== 'undefined'
      ? `${window.location.protocol}//${window.location.hostname}:3002`
      : 'http://localhost:3002';

  return (
    <AdminSettingPage headerTitle={'Code Sandbox 监控'} tocItems={tocItems}>
      {/* 1. 连接与连通性 */}
      <AdminSettingSection id="connection" title="连接与连通性">
        <AdminFormItem
          label="代码沙箱内部服务地址"
          tooltip="FastGPT 主站向代码执行独立沙箱进程发起的内部拓扑端点（由环境变量 CODE_SANDBOX_URL 提供）"
          mb={6}
        >
          <ConnectivityTestInput url={sandboxUrl} placeholder="http://sandbox:3002" />
        </AdminFormItem>

        <SimpleGrid columns={[1, 2]} spacing={5}>
          <AdminFormItem
            label="网络隔离与执行引擎"
            tooltip="代码沙箱当前采用的系统安全容器隔离策略"
          >
            <AdminReadonlyInput value="Bun / Node.js 内存隔离沙箱" />
          </AdminFormItem>

          <AdminFormItem
            label="启动容错模式"
            tooltip="沙箱不可达时仅限制代码执行节点，不影响主站全局服务"
          >
            <AdminReadonlyInput value="L1 探测降级（异常告警）" />
          </AdminFormItem>
        </SimpleGrid>
      </AdminSettingSection>

      {/* 2. 沙箱容器安全配额 */}
      <AdminSettingSection id="specs" title="沙箱容器安全配额" showDivider>
        <SimpleGrid columns={[1, 3]} spacing={5}>
          <AdminFormItem
            label="单次执行超时上限"
            tooltip="单段自定义 JS/Python 代码最长允许执行时间"
          >
            <AdminReadonlyInput value="60 秒 (SANDBOX_MAX_TIMEOUT)" />
          </AdminFormItem>

          <AdminFormItem label="单进程内存限制" tooltip="单个执行 Worker 允许使用的 RAM 峰值">
            <AdminReadonlyInput value="512 MB (SANDBOX_MAX_MEMORY_MB)" />
          </AdminFormItem>

          <AdminFormItem label="标准输出大小上限" tooltip="代码打印 stdout/stderr 的截断上限">
            <AdminReadonlyInput value="10 MB (SANDBOX_MAX_OUTPUT_MB)" />
          </AdminFormItem>
        </SimpleGrid>
      </AdminSettingSection>

      {/* 3. 运行时模块支持 */}
      <AdminSettingSection id="modules" title="运行时模块支持" showDivider>
        <AdminFormItem
          label="已支持 Python 模块库"
          tooltip="代码沙箱默认预装并允许 import 的 Python 扩展包白名单"
          mb={6}
        >
          <Box
            p={4}
            bg={'myGray.50'}
            borderRadius={'md'}
            borderWidth={'1px'}
            borderColor={'myGray.200'}
          >
            <Wrap spacing={2}>
              {pythonBuiltins.map((mod) => (
                <Tag key={mod} size={'md'} colorScheme={'blue'} variant={'subtle'}>
                  {mod}
                </Tag>
              ))}
            </Wrap>
          </Box>
        </AdminFormItem>

        <AdminFormItem
          label="已支持 Node.js / JavaScript 模块库"
          tooltip="JavaScript 代码节点默认可直接使用的依赖包清单"
        >
          <Box
            p={4}
            bg={'myGray.50'}
            borderRadius={'md'}
            borderWidth={'1px'}
            borderColor={'myGray.200'}
          >
            <Wrap spacing={2}>
              {nodeBuiltins.map((mod) => (
                <Tag key={mod} size={'md'} colorScheme={'green'} variant={'subtle'}>
                  {mod}
                </Tag>
              ))}
            </Wrap>
          </Box>
        </AdminFormItem>
      </AdminSettingSection>
    </AdminSettingPage>
  );
};

export default React.memo(CodeSandboxSubserviceComponent);
