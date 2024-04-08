import { AppWhisperConfigType } from './type';

export enum AppTypeEnum {
  simple = 'simple',
  advanced = 'advanced'
}
export const AppTypeMap = {
  [AppTypeEnum.simple]: {
    label: 'simple'
  },
  [AppTypeEnum.advanced]: {
    label: 'advanced'
  }
};

export const defaultWhisperConfig: AppWhisperConfigType = {
  open: false,
  autoSend: false,
  autoTTSResponse: false
};
