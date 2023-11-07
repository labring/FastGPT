import { ErrType } from '../errorCode';

/* team: 500000 */
export enum TeamErrEnum {
  teamOverSize = 'teamOverSize',
  unAuthTeam = 'unAuthTeam'
}
const teamErr = [
  { statusText: TeamErrEnum.teamOverSize, message: 'error.team.overSize' },
  { statusText: TeamErrEnum.unAuthTeam, message: '无权操作该团队' }
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
