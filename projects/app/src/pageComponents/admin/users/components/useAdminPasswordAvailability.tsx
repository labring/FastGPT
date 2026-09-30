import { Box } from '@chakra-ui/react';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { isPasswordAvailableForUsername } from '@fastgpt/global/support/user/account/password/utils';

/**
 * 判断管理端用户表单当前是否允许维护平台密码。
 *
 * 传入**所有**会参与服务端判定的用户名：新增时只有待创建的用户名；编辑时服务端会同时
 * 校验原用户名和新用户名（改名并同时设密码的场景），因此两个都要传，否则前端放行了
 * 服务端仍会以 ssoPasswordUnavailable 拒绝，出现「能填但提交必失败」的错位。
 *
 * 必须跟着表单实时计算：编辑弹窗允许改名，改名会让账号进出 SSO 命名空间。
 */
export const useAdminPasswordAvailability = (usernames: (string | undefined)[]) => {
  const { feConfigs } = useSystemStore();
  return usernames.every((username) => isPasswordAvailableForUsername(username, feConfigs?.sso));
};

/** 策略命中时的说明文案，替代被禁用的密码输入框，避免管理员提交后才收到后端报错。 */
export const SsoPasswordUnavailableTip = () => (
  <Box fontSize="sm" color="myGray.500" lineHeight="20px">
    当前已开启「禁止 SSO 用户使用密码」，该用户名属于 SSO 命名空间，无法设置或修改平台密码。
    如需恢复，请在「用户设置 - 自定义用户系统配置」中关闭该开关。
  </Box>
);
