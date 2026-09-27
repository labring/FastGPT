import React, { useEffect } from 'react';
import {
  Textarea,
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
  AdminReadonlyInput,
  type SettingTOCItem
} from '@/pageComponents/admin/settings';
import type { SystemInstanceConfigDomainMap } from '@fastgpt/global/common/system/config';

type SecurityConfigForm = Omit<SystemInstanceConfigDomainMap['security'], 'allowedOrigins'> & {
  allowedOriginsText: string;
};

const tocItems: SettingTOCItem[] = [
  { id: 'accessControl', label: '访问控制' },
  { id: 'loginProtection', label: '登录防护' },
  { id: 'fileAndRisk', label: '文件安全' },
  { id: 'riskNotice', label: '高风险安全策略' }
];

const SecuritySettingComponent = () => {
  const { effectiveConfig, isLoading, isUpdating, updateConfig } = useDomainConfig('security');

  const { control, handleSubmit, reset, register } = useForm<SecurityConfigForm>({
    defaultValues: {
      useIpLimit: false,
      checkInternalIp: false,
      csrfEnabled: true,
      passwordLoginMinuteLimitCount: 10,
      maxLoginSession: 10,
      skipFileTypeCheck: false,
      allowedOriginsText: ''
    }
  });

  useEffect(() => {
    if (effectiveConfig && Object.keys(effectiveConfig).length > 0) {
      reset({
        ...effectiveConfig,
        allowedOriginsText: (effectiveConfig.allowedOrigins ?? []).join('\n')
      });
    }
  }, [effectiveConfig, reset]);

  const onSave = handleSubmit(async (formData) => {
    // 换行与逗号分割转换字符串为数组
    const origins = formData.allowedOriginsText
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter(Boolean);

    const payload = {
      useIpLimit: Boolean(formData.useIpLimit),
      checkInternalIp: Boolean(formData.checkInternalIp),
      csrfEnabled: Boolean(formData.csrfEnabled),
      skipFileTypeCheck: Boolean(formData.skipFileTypeCheck),
      passwordLoginMinuteLimitCount: Number(formData.passwordLoginMinuteLimitCount) || 10,
      maxLoginSession: Number(formData.maxLoginSession) || 10,
      allowedOrigins: origins
    };

    await updateConfig(payload);
  });

  return (
    <AdminSettingPage
      headerTitle={'安全策略'}
      tocItems={tocItems}
      isLoading={isLoading}
      isSaving={isUpdating}
      onSave={onSave}
    >
      {/* 1. 访问控制 */}
      <AdminSettingSection id="accessControl" title="访问控制">
        <SimpleGrid columns={[1, 2]} spacingX={16} spacingY={4} mb={6}>
          <Controller
            name="useIpLimit"
            control={control}
            render={({ field }) => (
              <AdminSwitchRow
                label="IP 限流保护"
                tooltip="开启后，主站请求将受统一的 IP 访问频率限制，防止恶意刷取"
                isChecked={field.value}
                onChange={field.onChange}
              />
            )}
          />

          <Controller
            name="checkInternalIp"
            control={control}
            render={({ field }) => (
              <AdminSwitchRow
                label="内网 IP 访问拦截 (SSRF)"
                tooltip="开启后，主站向外发出 HTTP 请求时将阻止访问内网保留地址段，防范 SSRF"
                isChecked={field.value}
                onChange={field.onChange}
              />
            )}
          />

          <Controller
            name="csrfEnabled"
            control={control}
            render={({ field }) => (
              <AdminSwitchRow
                label="CSRF 严格校验"
                tooltip="防范跨站请求伪造攻击，建议生产环境始终保持开启状态"
                isChecked={field.value}
                onChange={field.onChange}
              />
            )}
          />
        </SimpleGrid>

        <AdminFormItem
          label="跨域来源白名单 (Allowed Origins)"
          tooltip="允许跨域访问主站 API 的 Origin 列表，支持按换行或逗号分隔多个域名"
        >
          <Textarea
            {...register('allowedOriginsText')}
            rows={4}
            placeholder="https://app.example.com&#10;https://chat.example.com"
          />
        </AdminFormItem>
      </AdminSettingSection>

      {/* 2. 登录防护 */}
      <AdminSettingSection id="loginProtection" title="登录防护" showDivider>
        <SimpleGrid columns={[1, 2]} spacing={5}>
          <AdminFormItem
            label="密码登录分钟限流次数"
            tooltip="单个账户每分钟最多允许尝试密码登录的失败次数上限"
            isRequired
          >
            <Controller
              name="passwordLoginMinuteLimitCount"
              control={control}
              render={({ field }) => (
                <NumberInput
                  min={1}
                  max={100}
                  value={field.value ?? 10}
                  onChange={(_, val) => field.onChange(val || 10)}
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
            label="最大登录会话数 (Max Sessions)"
            tooltip="单个用户最多允许同时在线的活动 Session 上限，超出将剔除最早的会话"
            isRequired
          >
            <Controller
              name="maxLoginSession"
              control={control}
              render={({ field }) => (
                <NumberInput
                  min={1}
                  max={100}
                  value={field.value ?? 10}
                  onChange={(_, val) => field.onChange(val || 10)}
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

      {/* 3. 文件安全 */}
      <AdminSettingSection id="fileAndRisk" title="文件安全" showDivider>
        <SimpleGrid columns={[1, 2]} spacingX={16} spacingY={4}>
          <Controller
            name="skipFileTypeCheck"
            control={control}
            render={({ field }) => (
              <AdminSwitchRow
                label="跳过文件类型检查"
                tooltip="高风险选项！开启后上传文件将不再严格校验 MIME/Magic Number 类型，仅建议在测试环境下使用"
                isChecked={field.value}
                onChange={field.onChange}
              />
            )}
          />
        </SimpleGrid>
      </AdminSettingSection>

      {/* 4. 高风险安全策略（系统默认只读） */}
      <AdminSettingSection id="riskNotice" title="高风险安全策略（只读说明）" showDivider>
        <SimpleGrid columns={[1, 2]} spacing={5}>
          <AdminFormItem
            label="HTTP 节点忽略 HTTPS 证书"
            tooltip="工作流 HTTP 节点发起外部请求时是否忽略非法或自签名证书，默认严格校验（false）"
          >
            <AdminReadonlyInput value="严格校验（不忽略非法证书）" />
          </AdminFormItem>

          <AdminFormItem
            label="输入输出模型安全内容审查"
            tooltip="对话与输入文本的违规安全拦截与合规审查通道"
          >
            <AdminReadonlyInput value="遵循系统安全审查配置" />
          </AdminFormItem>
        </SimpleGrid>
      </AdminSettingSection>
    </AdminSettingPage>
  );
};

export default React.memo(SecuritySettingComponent);
