import { i18nT } from '../../../../web/i18n/utils';
import type { ErrType } from '../errorCode';
/* team: 500000 */
export enum TeamErrEnum {
  notUser = 'notUser',
  teamOverSize = 'teamOverSize',
  unAuthTeam = 'unAuthTeam',
  teamMemberOverSize = 'teamMemberOverSize',
  aiPointsNotEnough = 'aiPointsNotEnough',
  datasetSizeNotEnough = 'datasetSizeNotEnough',
  datasetAmountNotEnough = 'datasetAmountNotEnough',
  appAmountNotEnough = 'appAmountNotEnough',
  pluginAmountNotEnough = 'pluginAmountNotEnough',
  appFolderAmountNotEnough = 'appFolderAmountNotEnough',
  websiteSyncNotEnough = 'websiteSyncNotEnough',
  reRankNotEnough = 'reRankNotEnough',
  ticketNotAvailable = 'ticketNotAvailable',
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
  invitationLinkInvalid = 'invitationLinkInvalid',
  youHaveBeenInTheTeam = 'youHaveBeenInTheTeam',
  tooManyInvitations = 'tooManyInvitations',
  unPermission = 'unPermission'
}

const teamErr = [
  {
    statusText: TeamErrEnum.notUser,
    message: i18nT('common:code_error.team_error.not_user')
  },
  {
    statusText: TeamErrEnum.unPermission,
    message: i18nT('common:error_un_permission')
  },
  {
    statusText: TeamErrEnum.teamOverSize,
    message: i18nT('common:code_error.team_error.over_size')
  },
  { statusText: TeamErrEnum.unAuthTeam, message: i18nT('common:code_error.team_error.un_auth') },
  {
    statusText: TeamErrEnum.aiPointsNotEnough,
    message: i18nT('common:code_error.team_error.ai_points_not_enough')
  }, // 需要定义或留空
  {
    statusText: TeamErrEnum.datasetSizeNotEnough,
    message: i18nT('common:code_error.team_error.dataset_size_not_enough')
  },
  {
    statusText: TeamErrEnum.datasetAmountNotEnough,
    message: i18nT('common:code_error.team_error.dataset_amount_not_enough')
  },
  {
    statusText: TeamErrEnum.appAmountNotEnough,
    message: i18nT('common:code_error.team_error.app_amount_not_enough')
  },
  {
    statusText: TeamErrEnum.pluginAmountNotEnough,
    message: i18nT('common:code_error.team_error.plugin_amount_not_enough')
  },
  {
    statusText: TeamErrEnum.appFolderAmountNotEnough,
    message: i18nT('common:code_error.team_error.app_folder_amount_not_enough')
  },
  {
    statusText: TeamErrEnum.websiteSyncNotEnough,
    message: i18nT('common:code_error.team_error.website_sync_not_enough')
  },
  {
    statusText: TeamErrEnum.reRankNotEnough,
    message: i18nT('common:code_error.team_error.re_rank_not_enough')
  },
  {
    statusText: TeamErrEnum.ticketNotAvailable,
    message: i18nT('common:code_error.team_error.ticket_not_available')
  },
  {
    statusText: TeamErrEnum.groupNameEmpty,
    message: i18nT('common:code_error.team_error.group_name_empty')
  },
  {
    statusText: TeamErrEnum.groupNotExist,
    message: i18nT('common:code_error.team_error.group_not_exist')
  },
  {
    statusText: TeamErrEnum.cannotDeleteDefaultGroup,
    message: i18nT('common:code_error.team_error.cannot_delete_default_group')
  },
  {
    statusText: TeamErrEnum.groupNameDuplicate,
    message: i18nT('common:code_error.team_error.group_name_duplicate')
  },
  {
    statusText: TeamErrEnum.userNotActive,
    message: i18nT('common:code_error.team_error.user_not_active')
  },
  {
    statusText: TeamErrEnum.orgMemberNotExist,
    message: i18nT('common:code_error.team_error.org_member_not_exist')
  },
  {
    statusText: TeamErrEnum.orgMemberDuplicated,
    message: i18nT('common:code_error.team_error.org_member_duplicated')
  },
  {
    statusText: TeamErrEnum.orgNotExist,
    message: i18nT('common:code_error.team_error.org_not_exist')
  },
  {
    statusText: TeamErrEnum.orgParentNotExist,
    message: i18nT('common:code_error.team_error.org_parent_not_exist')
  },
  {
    statusText: TeamErrEnum.cannotMoveToSubPath,
    message: i18nT('common:code_error.team_error.cannot_move_to_sub_path')
  },
  {
    statusText: TeamErrEnum.cannotModifyRootOrg,
    message: i18nT('common:code_error.team_error.cannot_modify_root_org')
  },
  {
    statusText: TeamErrEnum.cannotDeleteNonEmptyOrg,
    message: i18nT('common:code_error.team_error.cannot_delete_non_empty_org')
  },
  {
    statusText: TeamErrEnum.invitationLinkInvalid,
    message: i18nT('common:code_error.team_error.invitation_link_invalid')
  },
  {
    statusText: TeamErrEnum.youHaveBeenInTheTeam,
    message: i18nT('common:code_error.team_error.you_have_been_in_the_team')
  },
  {
    statusText: TeamErrEnum.tooManyInvitations,
    message: i18nT('common:code_error.team_error.too_many_invitations')
  }
];

export default teamErr.reduce((acc, cur, index) => {
  return {
    ...acc,
    [cur.statusText]: {
      code: 500000 + index,
      statusText: cur.statusText,
      message: cur.message,
      data: null
    }
  };
}, {} as ErrType<`${TeamErrEnum}`>);
