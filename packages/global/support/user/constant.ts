import { StandardSubLevelEnum } from "../wallet/sub/constants"
export enum UserStatusEnum {
  active = 'active',
  forbidden = 'forbidden'
}
export const userStatusMap = {
  [UserStatusEnum.active]: {
    label: 'support.user.status.active'
  },
  [UserStatusEnum.forbidden]: {
    label: 'support.user.status.forbidden'
  }
};

export enum OAuthEnum {
  github = 'github',
  google = 'google'
}

export enum UserAuthTypeEnum {
  register = 'register',
  findPassword = 'findPassword'
}

export const standardInfoMap = {
  [StandardSubLevelEnum.free]: {
    maxTeamNum: '1',
    maxAppNum: '1',
    maxPreservation: 7,
    other: ['10 万积分≈40 次对话 = 2 元']
  },
  [StandardSubLevelEnum.experience]: {
    maxTeamNum: '5',
    maxAppNum: '5',
    maxPreservation: 30,
    other: ['200 万积分 ≈ 800 次对话', '优先训练功能', '24 h/次 web 站点同步', '24 h/次 导出知识库 ', '重排优先级（选不同卡） ']
  },
  [StandardSubLevelEnum.team]: {
    maxTeamNum: '10',
    maxAppNum: '10',
    maxPreservation: 90,
    other: ['1500 万积分 ≈ 6000 次对话', '中级优先训练功能', '个人 key（不扣积分）', '自定义版权 logo，title，分享链接去水印 ', '12 h/次 web 站点同步 ', '12 h/次 导出知识库 ', '高级重排优先级（选不同卡） ']
  },
  [StandardSubLevelEnum.enterprise]: {
    maxTeamNum: '50',
    maxAppNum: '50',
    maxPreservation: 360,
    other: ['5000 万积分 ≈ 20000 次对话 ', '高级优先训练功能', '个人 key（不扣积分）', '自定义版权 logo，title，分享链接去水印 ', '6 h/次 web 站点同步', '6 h/次 导出知识库 ', '高级重排优先级（选不同卡） ']
  },
}