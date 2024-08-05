import { ErrType } from '../errorCode';
import { i18nT } from '../../../../web/i18n/utils';
/* team: 500000 */
export enum TeamErrEnum {
  teamOverSize = 'teamOverSize',
  unAuthTeam = 'unAuthTeam',
  aiPointsNotEnough = 'aiPointsNotEnough',
  datasetSizeNotEnough = 'datasetSizeNotEnough',
  datasetAmountNotEnough = 'datasetAmountNotEnough',
  appAmountNotEnough = 'appAmountNotEnough',
  pluginAmountNotEnough = 'pluginAmountNotEnough',
  websiteSyncNotEnough = 'websiteSyncNotEnough',
  reRankNotEnough = 'reRankNotEnough'
}

const teamErr = [
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
    statusText: TeamErrEnum.websiteSyncNotEnough,
    message: i18nT('common:code_error.team_error.website_sync_not_enough')
  },
  {
    statusText: TeamErrEnum.reRankNotEnough,
    message: i18nT('common:code_error.team_error.re_rank_not_enough')
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
