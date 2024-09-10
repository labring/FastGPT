type OutLinkSchema = Partial<{
  _id: string;
  shareId: string;
  teamId: string;
  tmbId: string;
  appId: string;
  name: string;
  // usagePoints: number;
  // lastTime: Date;
  // type: PublishChannelEnum;

  // whether the response content is detailed
  // responseDetail: boolean;
  //
  // // response when request
  // immediateResponse?: string;
  // // response when error or other situation
  // defaultResponse?: string;

  // limit?: {
  //   expiredTime?: Date;
  //   // Questions per minute
  //   QPM: number;
  //   maxUsagePoints: number;
  //   // Verification message hook url
  //   hookUrl?: string;
  // };
  app: any;
}>;

jest.mock('@fastgpt/service/support/outLink/schema', () => {
  const mockSchema = {
    _id: 'mock-id',
    find: () => {
      return mockSchema;
    },
    sort: () => {
      return mockSchema;
    }
  };
  return {
    MongoOutLink: mockSchema
  };
});
