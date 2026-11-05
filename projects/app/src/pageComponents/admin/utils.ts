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
  }
): boolean => {
  const licenseActive = options.licenseActive ?? true;
  // 配置字段按部署版本授权；License 只限制下方商业业务页面，与 API 的版本边界一致。
  const edition = getSystemEdition(options.isProService);

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
