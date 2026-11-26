import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import React, { useEffect, useMemo, useState } from 'react';
import { Box, Input, Textarea, SimpleGrid, Text } from '@chakra-ui/react';
import { useForm, useWatch, Controller } from 'react-hook-form';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useDomainConfig } from '@/web/common/system/useDomainConfig';
import { useAdminPermission } from '@/pageComponents/admin/useAdminPermission';
import AdminSettingPage from '@/pageComponents/admin/settings/AdminSettingPage';
import AdminSettingSection from '@/pageComponents/admin/settings/AdminSettingSection';
import AdminFormItem from '@/pageComponents/admin/settings/AdminFormItem';
import type { SettingTOCItem } from '@/pageComponents/admin/settings/AdminSettingTOC';
import ImageInput from '@/pageComponents/admin/settings/ImageInput';
import NavbarItems from '@/pageComponents/admin/config/components/FormField/NavbarItems';
import JsonEditor from '@fastgpt/web/components/common/Textarea/JsonEditor';
import type { SystemInstanceConfigDomainMap } from '@fastgpt/global/common/system/config/schema';

type SiteConfigForm = SystemInstanceConfigDomainMap['site'];

const SiteSettingComponent = () => {
  const { t } = useSafeTranslation();
  const { filterConfigData } = useAdminPermission();
  const { toast } = useToast();
  const tocItems: SettingTOCItem[] = useMemo(
    () => [
      { id: 'brand', label: t('admin:site_section_brand') },
      { id: 'externalLinks', label: t('admin:site_section_links') },
      { id: 'siteCustom', label: t('admin:site_section_custom') }
    ],
    [t]
  );

  const { effectiveConfig, isLoading, isUpdating, patchConfig } = useDomainConfig('site');

  const form = useForm<SiteConfigForm>({
    defaultValues: effectiveConfig
  });
  const { register, handleSubmit, reset, control, setValue } = form;

  const [scriptsText, setScriptsText] = useState<string | null>(null);
  const navbarItems = useWatch({ control, name: 'navbarItems' });

  // 当服务端返回生效配置后，重置表单为最新值
  useEffect(() => {
    if (effectiveConfig && Object.keys(effectiveConfig).length > 0) {
      reset(effectiveConfig);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setScriptsText(JSON.stringify(effectiveConfig.scripts ?? [], null, 2));
    }
  }, [effectiveConfig, reset]);

  const onSave = handleSubmit(async (formData) => {
    let scripts: unknown;
    const rawScripts = (scriptsText ?? '').trim();
    try {
      scripts = rawScripts ? JSON.parse(rawScripts) : [];
    } catch {
      form.setError('scripts', {
        type: 'validate',
        message: t('admin:site_scripts_must_be_valid_json_array')
      });
      toast({ status: 'error', title: t('admin:site_scripts_must_be_valid_json_array') });
      return;
    }
    if (!Array.isArray(scripts)) {
      form.setError('scripts', {
        type: 'validate',
        message: t('admin:site_scripts_must_be_valid_json_array')
      });
      toast({ status: 'error', title: t('admin:site_scripts_must_be_valid_json_array') });
      return;
    }

    await patchConfig(
      filterConfigData('site', {
        ...formData,
        scripts,
        customDomain: undefined,
        publicUrl: undefined
      }) as Record<string, unknown>
    );
  });

  const isScriptsDirty =
    scriptsText !== null && scriptsText !== JSON.stringify(effectiveConfig.scripts ?? [], null, 2);

  return (
    <AdminSettingPage
      form={form}
      headerTitle={t('admin:page_title_site')}
      tocItems={tocItems}
      isLoading={isLoading}
      isSaving={isUpdating}
      isUnsaved={isScriptsDirty}
      onSave={onSave}
    >
      {/* 1. 品牌信息 */}
      <AdminSettingSection id="brand" title={t('admin:site_section_brand')}>
        <AdminFormItem
          label={t('admin:site_name')}
          tooltip={t('admin:display_name_of_the_system_such_as_the_navbar_title_and_page')}
          isRequired
        >
          <Input
            isInvalid={Boolean(form.getFieldState('name', form.formState).error)}
            {...register('name', { required: true })}
            placeholder="AI"
          />
        </AdminFormItem>

        <AdminFormItem
          label={t('admin:site_description')}
          tooltip={t('admin:site_description_used_for_the_browser_meta_description_or_ex')}
        >
          <Textarea
            isInvalid={Boolean(form.getFieldState('description', form.formState).error)}
            {...register('description')}
            rows={3}
            placeholder={t('admin:enter_the_site_description')}
            resize={'vertical'}
          />
        </AdminFormItem>

        <AdminFormItem
          label={t('admin:openapi_key_prefix')}
          tooltip={t('admin:unified_prefix_for_generated_openapi_keys_default_fastgpt_ch')}
          isRequired
        >
          <Input
            isInvalid={Boolean(form.getFieldState('openApiPrefix', form.formState).error)}
            maxW={'400px'}
            {...register('openApiPrefix')}
            placeholder="fastgpt"
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
            label={t('admin:help_documentation_url')}
            tooltip={t('admin:official_documentation_link_used_by_documentation_and_help_e')}
          >
            <Input
              isInvalid={Boolean(form.getFieldState('docUrl', form.formState).error)}
              {...register('docUrl')}
              placeholder="https://doc.fastgpt.io"
            />
          </AdminFormItem>

          <AdminFormItem
            label={t('admin:template_tutorial_url')}
            tooltip={t('admin:target_link_of_the_use_tutorial_button_at_the_top_right_of_t')}
          >
            <Input
              isInvalid={Boolean(form.getFieldState('appTemplateCourse', form.formState).error)}
              {...register('appTemplateCourse')}
              placeholder="https://..."
            />
          </AdminFormItem>

          <AdminFormItem
            label={t('admin:login_guide_url')}
            tooltip={t('admin:help_documentation_link_for_account_issues_on_the_login_page')}
          >
            <Input
              isInvalid={Boolean(form.getFieldState('loginGuideDocUrl', form.formState).error)}
              {...register('loginGuideDocUrl')}
              placeholder="https://..."
            />
          </AdminFormItem>

          <AdminFormItem
            label={t('admin:custom_api_domain')}
            tooltip={t('admin:custom_api_domain_tip')}
          >
            <Input
              isInvalid={Boolean(form.getFieldState('customApiDomain', form.formState).error)}
              {...register('customApiDomain')}
              placeholder="https://api.example.com"
            />
          </AdminFormItem>

          <AdminFormItem
            label={t('admin:custom_share_page_domain')}
            tooltip={t('admin:custom_share_page_domain_tip')}
          >
            <Input
              isInvalid={Boolean(form.getFieldState('customSharePageDomain', form.formState).error)}
              {...register('customSharePageDomain')}
              placeholder="https://share.example.com"
            />
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
            isInvalid={Boolean(form.getFieldState('concatMd', form.formState).error)}
            {...register('concatMd')}
            rows={5}
            placeholder={t('admin:markdown_syntax_supported')}
          />
        </AdminFormItem>

        <Box
          mt={6}
          borderWidth={form.getFieldState('navbarItems', form.formState).error ? '1px' : undefined}
          borderColor={'red.500'}
          borderRadius={'md'}
        >
          <NavbarItems
            value={navbarItems}
            onChange={(val) => setValue('navbarItems', val, { shouldDirty: true })}
            title={t('admin:custom_navigation_links')}
            description={t('admin:add_custom_external_link_entries_to_the_left_navigation_bar')}
          />
          {form.getFieldState('navbarItems', form.formState).error && (
            <Text color={'red.500'} fontSize={'xs'}>
              {t('admin:failed_to_save_settings')}
            </Text>
          )}
        </Box>

        <AdminFormItem label={t('admin:bot_iframe_url')} tooltip={t('admin:bot_iframe_url_tip')}>
          <Input
            isInvalid={Boolean(form.getFieldState('botIframeUrl', form.formState).error)}
            {...register('botIframeUrl')}
            placeholder="https://..."
          />
        </AdminFormItem>

        <AdminFormItem label={t('admin:site_scripts')} tooltip={t('admin:site_scripts_tip')}>
          <Controller
            name="scripts"
            control={control}
            render={({ field }) => (
              <JsonEditor
                isInvalid={Boolean(form.getFieldState(field.name, form.formState).error)}
                value={scriptsText ?? JSON.stringify(field.value ?? [], null, 2)}
                onChange={setScriptsText}
                defaultHeight={220}
                resize
              />
            )}
          />
        </AdminFormItem>
      </AdminSettingSection>
    </AdminSettingPage>
  );
};

export default React.memo(SiteSettingComponent);
