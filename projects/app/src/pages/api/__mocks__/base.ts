// jest.mock('@fastgpt/service/common/mongo/index', jest.fn());
jest.mock('@fastgpt/service/common/system/log', jest.fn());

// jest.mock('@fastgpt/service/common/mongo', () => ({
//   getMongoModel: (name: string, schema: mongoose.Schema) => {
//     return mongoose.model(name, schema);
//   },
//   connectionMongo: mongoose.connection
// }));

jest.mock('@/service/middleware/entry', () => {
  return {
    NextAPI: (...args: any) => {
      return async function api(req: any, res: any) {
        try {
          let response = null;
          for (const handler of args) {
            response = await handler(req, res);
          }
          return {
            code: 200,
            data: response
          };
        } catch (error) {
          return {
            code: 500,
            error
          };
        }
      };
    }
  };
});
