import type { TrackRegisterParams } from '../../marketing/type';

export type GetWXLoginQRResponse = {
  code: string;
  codeUrl: string;
};

export type AccountRegisterBody = {
  username: string;
  code: string;
  password: string;
} & TrackRegisterParams;
