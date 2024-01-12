export const imageBaseUrl = '/api/system/img/';

export enum MongoImageTypeEnum {
  systemAvatar = 'systemAvatar',
  appAvatar = 'appAvatar',
  pluginAvatar = 'pluginAvatar',
  datasetAvatar = 'datasetAvatar',
  userAvatar = 'userAvatar',
  teamAvatar = 'teamAvatar',

  chatImage = 'chatImage',
  docImage = 'docImage'
}
export const mongoImageTypeMap = {
  [MongoImageTypeEnum.systemAvatar]: {
    label: 'common.file.type.appAvatar',
    unique: true
  },
  [MongoImageTypeEnum.appAvatar]: {
    label: 'common.file.type.appAvatar',
    unique: true
  },
  [MongoImageTypeEnum.pluginAvatar]: {
    label: 'common.file.type.pluginAvatar',
    unique: true
  },
  [MongoImageTypeEnum.datasetAvatar]: {
    label: 'common.file.type.datasetAvatar',
    unique: true
  },
  [MongoImageTypeEnum.userAvatar]: {
    label: 'common.file.type.userAvatar',
    unique: true
  },
  [MongoImageTypeEnum.teamAvatar]: {
    label: 'common.file.type.teamAvatar',
    unique: true
  },

  [MongoImageTypeEnum.chatImage]: {
    label: 'common.file.type.chatImage',
    unique: false
  },
  [MongoImageTypeEnum.docImage]: {
    label: 'common.file.type.docImage',
    unique: false
  }
};

export const uniqueImageTypeList = Object.entries(mongoImageTypeMap)
  .filter(([key, value]) => value.unique)
  .map(([key]) => key as `${MongoImageTypeEnum}`);
