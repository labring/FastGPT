export const imageBaseUrl = '/api/system/img/';

export enum MongoImageTypeEnum {
  systemAvatar = 'systemAvatar',
  appAvatar = 'appAvatar',
  pluginAvatar = 'pluginAvatar',
  datasetAvatar = 'datasetAvatar',
  userAvatar = 'userAvatar',
  teamAvatar = 'teamAvatar',
  groupAvatar = 'groupAvatar',

  chatImage = 'chatImage',
  collectionImage = 'collectionImage'
}
export const mongoImageTypeMap = {
  [MongoImageTypeEnum.systemAvatar]: {
    label: 'appAvatar',
    unique: true
  },
  [MongoImageTypeEnum.appAvatar]: {
    label: 'appAvatar',
    unique: true
  },
  [MongoImageTypeEnum.pluginAvatar]: {
    label: 'pluginAvatar',
    unique: true
  },
  [MongoImageTypeEnum.datasetAvatar]: {
    label: 'datasetAvatar',
    unique: true
  },
  [MongoImageTypeEnum.userAvatar]: {
    label: 'userAvatar',
    unique: true
  },
  [MongoImageTypeEnum.teamAvatar]: {
    label: 'teamAvatar',
    unique: true
  },
  [MongoImageTypeEnum.groupAvatar]: {
    label: 'groupAvatar',
    unique: true
  },

  [MongoImageTypeEnum.chatImage]: {
    label: 'chatImage',
    unique: false
  },
  [MongoImageTypeEnum.collectionImage]: {
    label: 'collectionImage',
    unique: false
  }
};

export const uniqueImageTypeList = Object.entries(mongoImageTypeMap)
  .filter(([key, value]) => value.unique)
  .map(([key]) => key as `${MongoImageTypeEnum}`);

export const FolderIcon = 'file/fill/folder';
export const FolderImgUrl = '/imgs/files/folder.svg';
export const HttpPluginImgUrl = '/imgs/app/httpPluginFill.svg';
export const HttpImgUrl = '/imgs/workflow/http.png';
