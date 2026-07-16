import { TeamEnterpriseAuthTaskStatusEnum } from '@fastgpt/global/support/user/team/enterpriseAuth/constant';

export const enterpriseAuthContactBusinessUrl =
  'https://fael3z0zfze.feishu.cn/share/base/form/shrcnjJWtKqjOI9NbQTzhNyzljc?prefill_S=xtbd&hide_S=1';

/**
 * 判断金额输入框下方是否展示“金额错误”。
 *
 * amount_failed 是持久化任务状态，表示这次认证任务历史上曾填错金额；
 * 只有本次弹窗内再次提交失败后，才把它转成输入框错误提示，避免退出重进仍显示旧错误。
 */
export const shouldShowEnterpriseAuthAmountError = ({
  taskStatus,
  showCurrentSubmitError
}: {
  taskStatus?: `${TeamEnterpriseAuthTaskStatusEnum}`;
  showCurrentSubmitError: boolean;
}) => taskStatus === TeamEnterpriseAuthTaskStatusEnum.amount_failed && showCurrentSubmitError;

/**
 * 只有金额验证阶段能打开金额确认弹窗。
 * starting/granting 仍属于未完成任务，但任务详情接口不会返回完整金额页数据。
 */
export const canOpenEnterpriseAuthAmountStep = (
  taskStatus?: `${TeamEnterpriseAuthTaskStatusEnum}`
) =>
  taskStatus === TeamEnterpriseAuthTaskStatusEnum.pending_amount ||
  taskStatus === TeamEnterpriseAuthTaskStatusEnum.amount_failed;

/**
 * 判断企业认证入口是否应该转为商务咨询弹窗。
 *
 * 次数耗尽但仍有金额验证任务时，用户需要继续完成当前任务；只有没有可继续任务时，
 * 才在入口按钮处直接提示联系商务。
 */
export const shouldShowEnterpriseAuthContactBusinessModal = ({
  hasRemainingAuthTimes,
  hasCurrentTask
}: {
  hasRemainingAuthTimes?: boolean;
  hasCurrentTask: boolean;
}) => hasRemainingAuthTimes === false && !hasCurrentTask;

/**
 * 判断当前成员是否可以发起或继续企业认证。
 *
 * 团队 owner 和团队管理员才有企业认证操作入口；statusCanManage 来自服务端状态接口，
 * 用于在服务端明确拒绝时兜底收紧权限，同时兼容旧接口未返回该字段的场景。
 */
export const canManageEnterpriseAuth = ({
  statusCanManage,
  isTeamOwner,
  hasTeamManagePer
}: {
  statusCanManage?: boolean;
  isTeamOwner?: boolean;
  hasTeamManagePer?: boolean;
}) => (!!isTeamOwner || !!hasTeamManagePer) && statusCanManage !== false;
