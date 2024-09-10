type MockAuthAppType = {
  app: {
    _id: string;
    type: string;
  };
};

let __app: MockAuthAppType = {
  app: {
    _id: 'mock-app-id',
    type: 'mock-app-type'
  }
};

jest.mock('@fastgpt/service/support/permission/app/auth', () => {
  return {
    async authApp({ appId, per, req }: { appId: string; per: string; req: any }) {
      if (!appId) {
        return null;
      }
    }
  };
});

export function setApp(app: MockAuthAppType) {
  __app = app;
}
