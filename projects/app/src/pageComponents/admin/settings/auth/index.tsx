import React, { useEffect } from 'react';
import {
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  SimpleGrid
} from '@chakra-ui/react';
import { useForm, Controller } from 'react-hook-form';
import { useDomainConfig } from '@/web/common/system/useDomainConfig';
import {
  AdminSettingPage,
  AdminSettingSection,
  AdminFormItem,
  AdminSwitchRow,
  type SettingTOCItem
} from '@/pageComponents/admin/settings';
import type { SystemInstanceConfigDomainMap } from '@fastgpt/global/common/system/config';

type AuthConfigForm = SystemInstanceConfigDomainMap['auth'];

const tocItems: SettingTOCItem[] = [
  { id: 'apiAndPassword', label: 'API 与密码策略' },
  { id: 'loginAndTeam', label: '登录与团队策略' }
];

const AuthSettingComponent = () => {
  const { effectiveConfig, isLoading, isUpdating, updateConfig } = useDomainConfig('auth');

  const { control, handleSubmit, reset } = useForm<AuthConfigForm>({
    defaultValues: effectiveConfig
  });

  useEffect(() => {
    if (effectiveConfig && Object.keys(effectiveConfig).length > 0) {
      reset(effectiveConfig);
    }
  }, [effectiveConfig, reset]);

  const onSave = handleSubmit(async (formData) => {
    // 密码过期月数：0 或 NaN 转为 null
    const payload = {
      ...formData,
      passwordExpiredMonth:
        formData.passwordExpiredMonth && Number(formData.passwordExpiredMonth) > 0
          ? Number(formData.passwordExpiredMonth)
          : null,
      openApiKeyMaxCount: Number(formData.openApiKeyMaxCount) || 100
    };
    await updateConfig(payload);
  });

  return (
    <AdminSettingPage
      headerTitle={'账号与登录'}
      tocItems={tocItems}
      isLoading={isLoading}
      isSaving={isUpdating}
      onSave={onSave}
    >
      {/* 1. API 与密码策略 */}
      <AdminSettingSection id="apiAndPassword" title="API 与密码策略">
        <AdminFormItem
          label="OpenAPI Key 数量上限"
          tooltip="每个团队最多允许创建的 OpenAPI Key 数量，防止密钥泛滥"
          isRequired
          mb={6}
        >
          <Controller
            name="openApiKeyMaxCount"
            control={control}
            render={({ field }) => (
              <NumberInput
                maxW={'400px'}
                min={1}
                max={10000}
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
          label="密码有效周期（月）"
          tooltip="密码强制定期的过期月数，留空或 0 表示密码永不过期"
          mb={6}
        >
          <Controller
            name="passwordExpiredMonth"
            control={control}
            render={({ field }) => (
              <NumberInput
                maxW={'400px'}
                min={0}
                max={120}
                value={field.value ?? ''}
                onChange={(_, val) => field.onChange(isNaN(val) || val <= 0 ? null : val)}
              >
                <NumberInputField placeholder="留空表示永不过期" />
                <NumberInputStepper>
                  <NumberIncrementStepper />
                  <NumberDecrementStepper />
                </NumberInputStepper>
              </NumberInput>
            )}
          />
        </AdminFormItem>
      </AdminSettingSection>

      {/* 2. 登录与团队策略 */}
      <AdminSettingSection id="loginAndTeam" title="登录与团队策略" showDivider>
        <SimpleGrid columns={[1, 2]} spacingX={16} spacingY={4}>
          <Controller
            name="wecomLoginAutoRedirect"
            control={control}
            render={({ field }) => (
              <AdminSwitchRow
                label="企业微信自动跳转"
                tooltip="在企业微信内置浏览器中打开登录页时，自动重定向至企微 OAuth 快速授权登录"
                isChecked={field.value}
                onChange={field.onChange}
              />
            )}
          />

          <Controller
            name="defaultTeamBasicPermissionsEnabled"
            control={control}
            render={({ field }) => (
              <AdminSwitchRow
                label="新团队默认开启基础权限"
                tooltip="新创建团队时，默认开启基础成员角色权限模板"
                isChecked={field.value}
                onChange={field.onChange}
              />
            )}
          />
        </SimpleGrid>
      </AdminSettingSection>
    </AdminSettingPage>
  );
};

export default React.memo(AuthSettingComponent);
