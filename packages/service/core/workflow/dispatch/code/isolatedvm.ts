// import { addLog } from '../../../../common/system/log';
// const ivm = require('isolated-vm');

// export const runJsCode = ({
//   code,
//   variables
// }: {
//   code: string;
//   variables: Record<string, any>;
// }) => {
//   const isolate = new ivm.Isolate({ memoryLimit: 16 });
//   const context = isolate.createContextSync();
//   const jail = context.global;

//   return new Promise((resolve, reject) => {
//     // custom log function
//     jail.setSync('responseData', function (args: any): any {
//       if (typeof args === 'object') {
//         resolve(args);
//       } else {
//         reject('Not an invalid response');
//       }
//     });

//     // Add global variables
//     jail.setSync('variables', new ivm.ExternalCopy(variables).copyInto());

//     try {
//       const scriptCode = `
//         ${code}
//         responseData(main(variables))`;
//       context.evalSync(scriptCode, { timeout: 2000 });
//     } catch (err) {
//       addLog.error('Error during script execution:', err);
//       reject(err);
//     }
//   });
// };
