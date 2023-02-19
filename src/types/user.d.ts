export enum UserNumberEnum {
  phone = 'phone',
  wx = 'wx'
}

export interface UserType {
  _id: string;
  email: string;
  accounts: {
    type: string;
    value: string;
  }[];
  balance: number;
}

export interface UserUpdateParams {
  accounts?: {
    type: string;
    value: string;
  }[];
}
