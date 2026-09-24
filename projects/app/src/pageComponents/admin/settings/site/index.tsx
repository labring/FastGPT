import React, { useEffect, useMemo } from 'react';
import { Input, Textarea, SimpleGrid } from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { useDomainConfig } from '@/web/common/system/useDomainConfig';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import {
  AdminSettingPage,
  AdminSettingSection,
  AdminFormItem,
  type SettingTOCItem
} from '@/pageComponents/admin/settings';
import type { SystemInstanceConfigDomainMap } from '@fastgpt/global/common/system/config';

type SiteConfigForm = SystemInstanceConfigDomainMap['site'];

const tocItems: SettingTOCItem[] = [
  { id: 'brand', label: '品牌信息' },
  { id: 'redirectAndMarket', label: '跳转与市场' },
  { id: 'docLinks', label: '文档链接' },
  { id: 'deployment', label: '部署拓扑' }
];

const SiteSettingComponent = () => {
  const { effectiveConfig, isLoading, isUpdating, updateConfig } = useDomainConfig('site');
  const { feConfigs } = useSystemStore();

  const { register, handleSubmit, reset } = useForm<SiteConfigForm>({
    defaultValues: effectiveConfig
  });

  // 当服务端返回生效配置后，重置表单为最新值
  useEffect(() => {
    if (effectiveConfig && Object.keys(effectiveConfig).length > 0) {
      reset(effectiveConfig);
    }
  }, [effectiveConfig, reset]);

  const onSave = handleSubmit(async (formData) => {
    await updateConfig(formData);
  });

  // 部署只读信息
  const deploymentInfo = useMemo(
    () => ({
      feDomain: typeof window !== 'undefined' ? window.location.origin : '',
      basePath: process.env.NEXT_PUBLIC_BASE_URL || '/',
      mcpProxy: feConfigs?.mcpServerProxyEndpoint || '未配置'
    }),
    [feConfigs?.mcpServerProxyEndpoint]
  );

  return (
    <AdminSettingPage
      headerTitle={'站点信息'}
      tocItems={tocItems}
      isLoading={isLoading}
      isSaving={isUpdating}
      onSave={onSave}
    >
      {/* 1. 品牌信息 */}
      <AdminSettingSection id="brand" title="品牌信息">
        <AdminFormItem
          label="站点名称"
          tooltip="系统对外展示的名称，如导航栏标题、网页 Title 等"
          isRequired
        >
          <Input {...register('name', { required: true })} placeholder="AI" />
        </AdminFormItem>

        <AdminFormItem label="站点描述" tooltip="站点基础简介，用于浏览器 Meta 描述或对外介绍">
          <Textarea
            {...register('description')}
            rows={3}
            placeholder="请输入站点描述"
            resize={'vertical'}
          />
        </AdminFormItem>

        <AdminFormItem label="站点图标 (Favicon URL)" tooltip="浏览器标签页展示的图标地址">
          <Input {...register('favicon')} placeholder="https://example.com/favicon.ico" />
        </AdminFormItem>

        <AdminFormItem
          label="页面标题后缀"
          tooltip="浏览器标签页 Title 后缀，如：FastGPT"
          isRequired
        >
          <Input {...register('systemTitle', { required: true })} placeholder="FastGPT" />
        </AdminFormItem>
      </AdminSettingSection>

      {/* 2. 跳转与市场 */}
      <AdminSettingSection id="redirectAndMarket" title="跳转与市场" showDivider>
        <AdminFormItem
          label="中文环境跳转地址"
          tooltip="当检测到中国大陆地区访问时自动重定向的地址，留空表示关闭跳转"
        >
          <Input {...register('chineseRedirectUrl')} placeholder="留空表示不开启跳转" />
        </AdminFormItem>

        <AdminFormItem label="应用/模板市场地址" tooltip="外部 Marketplace 服务的访问地址">
          <Input {...register('marketplaceUrl')} placeholder="https://v2.marketplace.fastgpt.cn" />
        </AdminFormItem>
      </AdminSettingSection>

      {/* 3. 文档链接 */}
      <AdminSettingSection id="docLinks" title="文档链接" showDivider>
        <AdminFormItem
          label="使用帮助文档地址"
          tooltip="系统内各处“使用说明”或帮助指引跳转的官方文档链接"
        >
          <Input {...register('docUrl')} placeholder="https://doc.fastgpt.io" />
        </AdminFormItem>

        <AdminFormItem label="OpenAPI 文档地址" tooltip="对外 API 开放平台指引文档地址">
          <Input
            {...register('openApiDocUrl')}
            placeholder="https://doc.fastgpt.io/openapi/intro"
          />
        </AdminFormItem>
      </AdminSettingSection>

      {/* 4. 部署拓扑（只读展示） */}
      <AdminSettingSection id="deployment" title="部署拓扑（只读）" showDivider>
        <SimpleGrid columns={[1, 2]} spacing={5}>
          <AdminFormItem label="当前访问域名" tooltip="通过浏览器当前访问环境解析的 Origin">
            <Input
              isReadOnly
              value={deploymentInfo.feDomain}
              bg={'myGray.50'}
              color={'myGray.600'}
            />
          </AdminFormItem>

          <AdminFormItem
            label="站点 BasePath"
            tooltip="环境变量 NEXT_PUBLIC_BASE_URL 指定的基础路由前缀"
          >
            <Input
              isReadOnly
              value={deploymentInfo.basePath}
              bg={'myGray.50'}
              color={'myGray.600'}
            />
          </AdminFormItem>

          <AdminFormItem
            label="MCP SSE 代理地址"
            tooltip="环境变量 SSE_MCP_SERVER_PROXY_ENDPOINT 提供的代理地址"
          >
            <Input
              isReadOnly
              value={deploymentInfo.mcpProxy}
              bg={'myGray.50'}
              color={'myGray.600'}
            />
          </AdminFormItem>
        </SimpleGrid>
      </AdminSettingSection>
    </AdminSettingPage>
  );
};

export default React.memo(SiteSettingComponent);
