import { ErrType } from '../errorCode';

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
  { statusText: TeamErrEnum.teamOverSize, message: 'error.team.overSize' },
  { statusText: TeamErrEnum.unAuthTeam, message: '无权操作该团队' },
  { statusText: TeamErrEnum.aiPointsNotEnough, message: '' },
  { statusText: TeamErrEnum.datasetSizeNotEnough, message: '知识库容量不足，请先扩容~' },
  { statusText: TeamErrEnum.datasetAmountNotEnough, message: '知识库数量已达上限~' },
  { statusText: TeamErrEnum.appAmountNotEnough, message: '应用数量已达上限~' },
  { statusText: TeamErrEnum.pluginAmountNotEnough, message: '插件数量已达上限~' },
  { statusText: TeamErrEnum.websiteSyncNotEnough, message: '无权使用Web站点同步~' },
  { statusText: TeamErrEnum.reRankNotEnough, message: '无权使用检索重排~' }
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
