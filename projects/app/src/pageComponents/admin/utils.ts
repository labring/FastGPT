import {
  adminConfigPageFieldsMap,
  countPageVisibleFields
} from '@fastgpt/global/common/system/config/pageFields';
import { getSystemEdition } from '@fastgpt/global/common/system/config/permission';

/**
 * 判断指定后台路由在当前环境与配置下是否可见。
 * 遵循「逐字段版本归属与入口自动隐藏」规范：
 * - 配置/子服务页面按所管理字段的实际可见数判断，可见字段为 0 时自动隐藏；
 * - 业务页面沿用各自业务规则（商业版、License 激活状态、支付能力）。
 */
export const isRouteVisible = (
  route: string,
  options: {
    isProService: boolean;
    hasPayCapability?: boolean;
    licenseActive?: boolean;
    enableSaasAdminConfig?: boolean;
    hasExternalProviderWorkflowVariables?: boolean;
  }
): boolean => {
  const licenseActive = options.licenseActive ?? true;
  // 普通配置字段按部署版本授权；商业化入口额外要求 License 已激活。
  const edition = getSystemEdition(options.isProService);

  // 已弃用的变量配置是该页唯一内容；未配置或已清空时，菜单与直接访问均关闭。
  if (route === '/admin/settings/providers' && !options.hasExternalProviderWorkflowVariables) {
    return false;
  }

  // 支付配置属于商业化分组，不能通过普通配置页的字段可见性绕过授权门禁。
  if (route === '/admin/settings/pay' && (!options.isProService || !licenseActive)) {
    return false;
  }

  // 1. 配置或子服务页面：按所管理字段在当前版本和显示条件下的可见数量判定
  if (route in adminConfigPageFieldsMap) {
    return (
      countPageVisibleFields(route, {
        edition,
        enableSaasAdminConfig: options.enableSaasAdminConfig
      }) > 0
    );
  }

  // 2. 非配置页面沿用各自业务规则：
  if (route === '/admin/license' || route === '/admin/migration') {
    return true;
  }
  if (route === '/admin/resources/model' || route === '/admin/resources/tool') {
    return true;
  }
  if (route === '/admin/resources/app_template') {
    return options.isProService && licenseActive;
  }
  if (route === '/admin/plans' || route === '/admin/pays' || route === '/admin/invoice') {
    return options.isProService && licenseActive && (options.hasPayCapability ?? true);
  }

  // 商业版业务页面（数据面板、通知管理、用户管理、团队管理、应用管理、知识库管理、审计日志）
  return options.isProService && licenseActive;
};

/**
 * 递归检查 RHF dirtyFields 是否存在实际已编辑字段。
 * 不直接读 formState.isDirty：omitDomainSecrets 会省略密钥字段，未编辑的 Controller
 * 注册写入 undefined 后会导致 RHF 的 deepEqual 因键数不等在首屏即误判为 isDirty。
 */
export const hasDirtyFields = (value: unknown): boolean => {
  if (value === true) return true;
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(hasDirtyFields);
  return Object.values(value).some(hasDirtyFields);
};
