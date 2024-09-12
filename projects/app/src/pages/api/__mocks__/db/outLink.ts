// import { TestOutLinkList, TestOutLinkSchema } from '@/test/test-cases/outLink';
//
// jest.mock('@fastgpt/service/support/outLink/schema', () => {
//   const mockSchema: TestOutLinkSchema & {
//     find: () => TestOutLinkSchema[];
//     sort: () => TestOutLinkSchema[];
//   } = {
//     find: (filter: Partial<TestOutLinkSchema>) => {
//       return TestOutLinkList.filter((item) => {
//         return Object.keys(filter).every((key) => {
//           // @ts-ignore
//           return filter[key] === item[key];
//         });
//       });
//     },
//     sort: () => {
//       return mockSchema;
//     }
//   };
//   return {
//     MongoOutLink: mockSchema
//   };
// });
