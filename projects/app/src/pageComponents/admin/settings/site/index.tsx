import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import React, { useEffect, useMemo } from 'react';
import { Box, Input, Textarea, SimpleGrid } from '@chakra-ui/react';
import { useForm, useWatch } from 'react-hook-form';
import { useDomainConfig } from '@/web/common/system/useDomainConfig';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import AdminSettingPage from '@/pageComponents/admin/settings/AdminSettingPage';
import AdminSettingSection from '@/pageComponents/admin/settings/AdminSettingSection';
import AdminFormItem from '@/pageComponents/admin/settings/AdminFormItem';
import AdminReadonlyInput from '@/pageComponents/admin/settings/AdminReadonlyInput';
import type { SettingTOCItem } from '@/pageComponents/admin/settings/AdminSettingTOC';
import ImageInput from '@/pageComponents/admin/settings/ImageInput';
import NavbarItems from '@/pageComponents/admin/config/components/FormField/NavbarItems';
import type { SystemInstanceConfigDomainMap } from '@fastgpt/global/common/system/config/type';

type SiteConfigForm = SystemInstanceConfigDomainMap['site'];

const SiteSettingComponent = () => {
  const { t } = useClientTranslation('admin');
  const tocItems: SettingTOCItem[] = useMemo(
    () => [
      { id: 'brand', label: t('admin:site_section_brand') },
      { id: 'externalLinks', label: t('admin:site_section_links') },
      { id: 'siteCustom', label: t('admin:site_section_custom') },
      { id: 'deployment', label: t('admin:site_section_deployment') }
    ],
    [t]
  );

  const { effectiveConfig, isLoading, isUpdating, updateConfig } = useDomainConfig('site');
  const { feConfigs } = useSystemStore();

  const { register, handleSubmit, reset, control, setValue } = useForm<SiteConfigForm>({
    defaultValues: effectiveConfig
  });

  // 当服务端返回生效配置后，重置表单为最新值
  useEffect(() => {
    if (effectiveConfig && Object.keys(effectiveConfig).length > 0) {
      reset(effectiveConfig);
    }
  }, [effectiveConfig, reset]);

  const navbarItems = useWatch({ control, name: 'navbarItems' });

  const onSave = handleSubmit(async (formData) => {
    await updateConfig(formData);
  });

  // 部署只读信息（文件服务域名与下载前缀已移至「文件与存储策略」页）
  const deploymentInfo = useMemo(
    () => ({
      feDomain: typeof window !== 'undefined' ? window.location.origin : '',
      basePath: process.env.NEXT_PUBLIC_BASE_URL || '/'
    }),
    [feConfigs]
  );

  return (
    <AdminSettingPage
      headerTitle={t('admin:page_title_site')}
      tocItems={tocItems}
      isLoading={isLoading}
      isSaving={isUpdating}
      onSave={onSave}
    >
      {/* 1. 品牌信息 */}
      <AdminSettingSection id="brand" title={t('admin:site_section_brand')}>
        <AdminFormItem
          label={t('admin:site_name')}
          tooltip={t('admin:display_name_of_the_system_such_as_the_navbar_title_and_page')}
          isRequired
        >
          <Input {...register('name', { required: true })} placeholder="AI" />
        </AdminFormItem>

        <AdminFormItem
          label={t('admin:site_description')}
          tooltip={t('admin:site_description_used_for_the_browser_meta_description_or_ex')}
        >
          <Textarea
            {...register('description')}
            rows={3}
            placeholder={t('admin:enter_the_site_description')}
            resize={'vertical'}
          />
        </AdminFormItem>

        <AdminFormItem
          label={t('admin:site_favicon')}
          tooltip={t('admin:favicon_shown_in_the_browser_tab_upload_an_image_directly')}
        >
          <Box maxW={'160px'}>
            <ImageInput control={control} name="favicon" />
          </Box>
        </AdminFormItem>
      </AdminSettingSection>

      {/* 2. 外链地址 */}
      <AdminSettingSection id="externalLinks" title={t('admin:site_section_links')} showDivider>
        <SimpleGrid columns={[1, 2]} spacing={5}>
          <AdminFormItem
            label={t('admin:plugin_marketplace_url')}
            tooltip={t('admin:url_of_the_external_plugin_template_marketplace_service')}
          >
            <Input
              {...register('marketplaceUrl')}
              placeholder="https://v2.marketplace.fastgpt.cn"
            />
          </AdminFormItem>

          <AdminFormItem
            label={t('admin:help_documentation_url')}
            tooltip={t('admin:official_documentation_link_used_by_documentation_and_help_e')}
          >
            <Input {...register('docUrl')} placeholder="https://doc.fastgpt.io" />
          </AdminFormItem>

          <AdminFormItem
            label={t('admin:openapi_documentation_url')}
            tooltip={t('admin:public_api_platform_documentation_url')}
          >
            <Input
              {...register('openApiDocUrl')}
              placeholder="https://doc.fastgpt.io/openapi/intro"
            />
          </AdminFormItem>

          <AdminFormItem
            label={t('admin:template_tutorial_url')}
            tooltip={t('admin:target_link_of_the_use_tutorial_button_at_the_top_right_of_t')}
          >
            <Input {...register('appTemplateCourse')} placeholder="https://..." />
          </AdminFormItem>

          <AdminFormItem
            label={t('admin:login_guide_url')}
            tooltip={t('admin:help_documentation_link_for_account_issues_on_the_login_page')}
          >
            <Input {...register('loginGuideDocUrl')} placeholder="https://..." />
          </AdminFormItem>
        </SimpleGrid>
      </AdminSettingSection>

      {/* 3. 站点定制 */}
      <AdminSettingSection id="siteCustom" title={t('admin:site_section_custom')} showDivider>
        <AdminFormItem
          label={t('admin:contact_us_modal_content_markdown')}
          tooltip={t('admin:replaces_the_contact_us_prompt_content_after_configuration_m')}
        >
          <Textarea
            {...register('concatMd')}
            rows={5}
            placeholder={t('admin:markdown_syntax_supported')}
          />
        </AdminFormItem>

        <Box mt={6}>
          <NavbarItems
            value={navbarItems}
            onChange={(val) => setValue('navbarItems', val)}
            title={t('admin:custom_navigation_links')}
            description={t('admin:add_custom_external_link_entries_to_the_left_navigation_bar')}
          />
        </Box>
      </AdminSettingSection>

      {/* 4. 部署拓扑（只读展示） */}
      <AdminSettingSection
        id="deployment"
        title={t('admin:deployment_topology_read_only')}
        showDivider
      >
        <SimpleGrid columns={[1, 2]} spacing={5}>
          <AdminFormItem
            label={t('admin:current_access_domain')}
            tooltip={t('admin:origin_resolved_from_the_browser_s_current_access_environmen')}
          >
            <AdminReadonlyInput value={deploymentInfo.feDomain} />
          </AdminFormItem>

          <AdminFormItem
            label={t('admin:site_basepath')}
            tooltip={t('admin:base_route_prefix_specified_by_next_public_base_url')}
          >
            <AdminReadonlyInput value={deploymentInfo.basePath} />
          </AdminFormItem>

          <AdminFormItem
            label={t('admin:chinese_environment_redirect_url')}
            tooltip={t('admin:provided_by_chinese_ip_redirect_url_the_url_to_redirect_to_w')}
          >
            <AdminReadonlyInput
              value={feConfigs?.chineseRedirectUrl || t('admin:not_configured')}
            />
          </AdminFormItem>
        </SimpleGrid>
      </AdminSettingSection>
    </AdminSettingPage>
  );
};

export default React.memo(SiteSettingComponent);
