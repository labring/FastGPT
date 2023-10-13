export type UserModelSchema = {
  _id: string;
  username: string;
  password: string;
  avatar: string;
  balance: number;
  promotionRate: number;
  inviterId?: string;
  openaiKey: string;
  createTime: number;
  timezone: string;
  openaiAccount?: {
    key: string;
    baseUrl: string;
  };
  limit: {
    exportKbTime?: Date;
  };
};
