import { EnterpriseAuthErrEnum } from '../../../support/user/team/enterpriseAuth/constant';
import { i18nT } from '../../i18n/utils';
import type { ErrorHttpStatus, ErrType } from '../errorCode';
/* team: 500000 */
export enum TeamErrEnum {
  notUser = 'notUser',
  unAuthTeam = 'unAuthTeam',

  teamOverSize = 'teamOverSize',
  teamMemberOverSize = 'teamMemberOverSize',
  aiPointsNotEnough = 'aiPointsNotEnough',
  datasetSizeNotEnough = 'datasetSizeNotEnough',
  datasetAmountNotEnough = 'datasetAmountNotEnough',
  appAmountNotEnough = 'appAmountNotEnough',
  pluginAmountNotEnough = 'pluginAmountNotEnough',
  appFolderAmountNotEnough = 'appFolderAmountNotEnough',
  datasetFolderAmountNotEnough = 'datasetFolderAmountNotEnough',
  websiteSyncNotEnough = 'websiteSyncNotEnough',
  reRankNotEnough = 'reRankNotEnough',
  ticketNotAvailable = 'ticketNotAvailable',
  sandboxNotSupport = 'sandboxNotSupport',

  groupNameEmpty = 'groupNameEmpty',
  groupNameDuplicate = 'groupNameDuplicate',
  groupNotExist = 'groupNotExist',
  orgMemberNotExist = 'orgMemberNotExist',
  orgMemberDuplicated = 'orgMemberDuplicated',
  orgNotExist = 'orgNotExist',
  orgParentNotExist = 'orgParentNotExist',
  cannotMoveToSubPath = 'cannotMoveToSubPath',
  cannotModifyRootOrg = 'cannotModifyRootOrg',
  cannotDeleteNonEmptyOrg = 'cannotDeleteNonEmptyOrg',
  cannotDeleteDefaultGroup = 'cannotDeleteDefaultGroup',
  userNotActive = 'userNotActive',
  userForbidden = 'userForbidden',
  invitationLinkInvalid = 'invitationLinkInvalid',
  youHaveBeenInTheTeam = 'youHaveBeenInTheTeam',
  tooManyInvitations = 'tooManyInvitations',
  unPermission = 'unPermission',
  accountCancellationPending = 'accountCancellationPending',
  teamPluginInstallDisabled = 'teamPluginInstallDisabled',
  teamOwnerOverSize = 'teamOwnerOverSize',
  onlyMultiTeam = 'onlyMultiTeam',
  ownerTransferConflict = 'ownerTransferConflict'
}

const teamErr: Array<{
  statusText: TeamErrEnum | EnterpriseAuthErrEnum;
  message: string;
  httpStatus: ErrorHttpStatus;
}> = [
  {
    statusText: TeamErrEnum.notUser,
    message: i18nT('common:code_error.team_error.not_user'),
    httpStatus: 404
  },
  {
    statusText: TeamErrEnum.unPermission,
    message: i18nT('common:error_un_permission'),
    httpStatus: 403
  },
  {
    statusText: TeamErrEnum.accountCancellationPending,
    message: i18nT('common:code_error.team_error.account_cancellation_pending'),
    httpStatus: 403
  },
  {
    statusText: TeamErrEnum.teamOverSize,
    message: i18nT('common:code_error.team_error.over_size'),
    httpStatus: 403
  },
  {
    statusText: TeamErrEnum.unAuthTeam,
    message: i18nT('common:code_error.team_error.un_auth'),
    httpStatus: 403
  },
  {
    statusText: TeamErrEnum.aiPointsNotEnough,
    message: i18nT('common:code_error.team_error.ai_points_not_enough'),
    httpStatus: 402
  }, // 需要定义或留空
  {
    statusText: TeamErrEnum.datasetSizeNotEnough,
    message: i18nT('common:code_error.team_error.dataset_size_not_enough'),
    httpStatus: 403
  },
  {
    statusText: TeamErrEnum.datasetAmountNotEnough,
    message: i18nT('common:code_error.team_error.dataset_amount_not_enough'),
    httpStatus: 403
  },
  {
    statusText: TeamErrEnum.appAmountNotEnough,
    message: i18nT('common:code_error.team_error.app_amount_not_enough'),
    httpStatus: 403
  },
  {
    statusText: TeamErrEnum.pluginAmountNotEnough,
    message: i18nT('common:code_error.team_error.plugin_amount_not_enough'),
    httpStatus: 403
  },
  {
    statusText: TeamErrEnum.appFolderAmountNotEnough,
    message: i18nT('common:code_error.team_error.app_folder_amount_not_enough'),
    httpStatus: 403
  },
  {
    statusText: TeamErrEnum.websiteSyncNotEnough,
    message: i18nT('common:code_error.team_error.website_sync_not_enough'),
    httpStatus: 403
  },
  {
    statusText: TeamErrEnum.reRankNotEnough,
    message: i18nT('common:code_error.team_error.re_rank_not_enough'),
    httpStatus: 403
  },
  {
    statusText: TeamErrEnum.ticketNotAvailable,
    message: i18nT('common:code_error.team_error.ticket_not_available'),
    httpStatus: 403
  },
  {
    statusText: TeamErrEnum.groupNameEmpty,
    message: i18nT('common:code_error.team_error.group_name_empty'),
    httpStatus: 400
  },
  {
    statusText: TeamErrEnum.groupNotExist,
    message: i18nT('common:code_error.team_error.group_not_exist'),
    httpStatus: 404
  },
  {
    statusText: TeamErrEnum.cannotDeleteDefaultGroup,
    message: i18nT('common:code_error.team_error.cannot_delete_default_group'),
    httpStatus: 400
  },
  {
    statusText: TeamErrEnum.groupNameDuplicate,
    message: i18nT('common:code_error.team_error.group_name_duplicate'),
    httpStatus: 409
  },
  {
    statusText: TeamErrEnum.userNotActive,
    message: i18nT('common:code_error.team_error.user_not_active'),
    httpStatus: 403
  },
  {
    statusText: TeamErrEnum.userForbidden,
    message: i18nT('common:code_error.team_error.user_forbidden'),
    httpStatus: 403
  },
  {
    statusText: TeamErrEnum.orgMemberNotExist,
    message: i18nT('common:code_error.team_error.org_member_not_exist'),
    httpStatus: 404
  },
  {
    statusText: TeamErrEnum.orgMemberDuplicated,
    message: i18nT('common:code_error.team_error.org_member_duplicated'),
    httpStatus: 409
  },
  {
    statusText: TeamErrEnum.orgNotExist,
    message: i18nT('common:code_error.team_error.org_not_exist'),
    httpStatus: 404
  },
  {
    statusText: TeamErrEnum.orgParentNotExist,
    message: i18nT('common:code_error.team_error.org_parent_not_exist'),
    httpStatus: 404
  },
  {
    statusText: TeamErrEnum.cannotMoveToSubPath,
    message: i18nT('common:code_error.team_error.cannot_move_to_sub_path'),
    httpStatus: 400
  },
  {
    statusText: TeamErrEnum.cannotModifyRootOrg,
    message: i18nT('common:code_error.team_error.cannot_modify_root_org'),
    httpStatus: 400
  },
  {
    statusText: TeamErrEnum.cannotDeleteNonEmptyOrg,
    message: i18nT('common:code_error.team_error.cannot_delete_non_empty_org'),
    httpStatus: 400
  },
  {
    statusText: TeamErrEnum.invitationLinkInvalid,
    message: i18nT('common:code_error.team_error.invitation_link_invalid'),
    httpStatus: 400
  },
  {
    statusText: TeamErrEnum.youHaveBeenInTheTeam,
    message: i18nT('common:code_error.team_error.you_have_been_in_the_team'),
    httpStatus: 409
  },
  {
    statusText: TeamErrEnum.tooManyInvitations,
    message: i18nT('common:code_error.team_error.too_many_invitations'),
    httpStatus: 429
  },
  {
    statusText: TeamErrEnum.datasetFolderAmountNotEnough,
    message: i18nT('common:code_error.team_error.dataset_folder_amount_not_enough'),
    httpStatus: 403
  },
  {
    statusText: TeamErrEnum.sandboxNotSupport,
    message: i18nT('common:code_error.team_error.sandbox_not_support'),
    httpStatus: 403
  },
  {
    statusText: EnterpriseAuthErrEnum.disabled,
    message: i18nT('common:enterprise_auth.error.disabled'),
    httpStatus: 403
  },
  {
    statusText: EnterpriseAuthErrEnum.serviceNotConfigured,
    message: i18nT('common:enterprise_auth.error.service_not_configured'),
    httpStatus: 503
  },
  {
    statusText: EnterpriseAuthErrEnum.noRemainingTimes,
    message: i18nT('common:enterprise_auth.error.no_remaining_times'),
    httpStatus: 403
  },
  {
    statusText: EnterpriseAuthErrEnum.alreadyVerified,
    message: i18nT('common:enterprise_auth.error.already_verified'),
    httpStatus: 409
  },
  {
    statusText: EnterpriseAuthErrEnum.enterpriseOccupied,
    message: i18nT('common:enterprise_auth.error.enterprise_occupied'),
    httpStatus: 409
  },
  {
    statusText: EnterpriseAuthErrEnum.tooFrequent,
    message: i18nT('common:enterprise_auth.error.too_frequent'),
    httpStatus: 429
  },
  {
    statusText: EnterpriseAuthErrEnum.serviceError,
    message: i18nT('common:enterprise_auth.error.service_error'),
    httpStatus: 502
  },
  {
    statusText: EnterpriseAuthErrEnum.serviceTimeout,
    message: i18nT('common:enterprise_auth.error.service_timeout'),
    httpStatus: 504
  },
  {
    statusText: EnterpriseAuthErrEnum.infoFailed,
    message: i18nT('common:enterprise_auth.error.info_failed'),
    httpStatus: 400
  },
  {
    statusText: EnterpriseAuthErrEnum.taskNotFound,
    message: i18nT('common:enterprise_auth.error.task_not_found'),
    httpStatus: 404
  },
  {
    statusText: EnterpriseAuthErrEnum.taskExpired,
    message: i18nT('common:enterprise_auth.error.task_expired'),
    httpStatus: 410
  },
  {
    statusText: EnterpriseAuthErrEnum.amountError,
    message: i18nT('common:enterprise_auth.error.amount_error'),
    httpStatus: 400
  },
  {
    statusText: EnterpriseAuthErrEnum.amountFailed,
    message: i18nT('common:enterprise_auth.error.amount_failed'),
    httpStatus: 400
  },
  {
    statusText: EnterpriseAuthErrEnum.processing,
    message: i18nT('common:enterprise_auth.error.processing'),
    httpStatus: 409
  },
  {
    statusText: TeamErrEnum.teamPluginInstallDisabled,
    message: i18nT('common:code_error.team_error.team_plugin_install_disabled'),
    httpStatus: 403
  },
  {
    statusText: TeamErrEnum.teamOwnerOverSize,
    message: i18nT('common:code_error.team_error.owner_team_over_size'),
    httpStatus: 403
  },
  {
    statusText: TeamErrEnum.onlyMultiTeam,
    message: i18nT('common:code_error.team_error.only_multi_team'),
    httpStatus: 403
  },
  {
    statusText: TeamErrEnum.ownerTransferConflict,
    message: i18nT('common:code_error.team_error.owner_transfer_conflict'),
    httpStatus: 409
  }
];

export default teamErr.reduce(
  (acc, cur, index) => {
    return {
      ...acc,
      [cur.statusText]: {
        code: 500000 + index,
        statusText: cur.statusText,
        message: cur.message,
        data: null,
        httpStatus: cur.httpStatus
      }
    };
  },
  {} as ErrType<`${TeamErrEnum}` | `${EnterpriseAuthErrEnum}`>
);
