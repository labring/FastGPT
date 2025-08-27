// import { connectionMinio } from './index';
// import { addLog } from '../system/log';
// import { retryFn } from '@fastgpt/global/common/system/utils';

// export const ensureBucket = async (bucketName: string, isPublic: boolean = false) => {
//   return retryFn(async () => {
//     try {
//       const bucketExists = await connectionMinio.bucketExists(bucketName);

//       if (isPublic) {
//         // Set public read policy
//         const policy = {
//           Version: '2012-10-17',
//           Statement: [
//             {
//               Effect: 'Allow',
//               Principal: '*',
//               Action: ['s3:GetObject'],
//               Resource: [`arn:aws:s3:::${bucketName}/*`]
//             }
//           ]
//         };

//         await connectionMinio.setBucketPolicy(bucketName, JSON.stringify(policy));
//         addLog.info(`Set public read policy for bucket: ${bucketName}`);
//       }

//       return true;
//     } catch (error) {
//       addLog.error(`Failed to ensure bucket ${bucketName}:`, error);
//       throw error;
//     }
//   }, 3);
// };
