import { hashStr } from '@fastgpt/global/common/string/tools';

/** 构造 root 密码重置更新；原生 Mongo 写入需手动遵循 Mongoose 的双层哈希格式。 */
export const createRootPasswordUpdate = (password: string) => ({
  $set: {
    password: hashStr(hashStr(password)),
    passwordUpdateTime: new Date()
  }
});

/** 解析脚本唯一的必填参数；不再支持省略密码，必须明确提供新密码。 */
export const resolveRootPasswordArgument = (args: string[]) => {
  if (args.length !== 1) throw new Error('用法：node reset-root-password.cjs <root新密码>');
  return args[0];
};
