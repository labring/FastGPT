import { hashStr } from '@fastgpt/global/common/string/tools';

const DEFAULT_ROOT_PASSWORD = '123456';

/** 构造 root 密码重置更新；原生 Mongo 写入需手动遵循 Mongoose 的双层哈希格式。 */
export const createRootPasswordUpdate = (password: string) => ({
  $set: {
    password: hashStr(hashStr(password)),
    passwordUpdateTime: new Date(),
    isActivated: false
  }
});

/** 解析脚本唯一的可选参数；省略密码时使用兼容安装流程的默认值。 */
export const resolveRootPasswordArgument = (args: string[]) => {
  if (args.length > 1) throw new Error('用法：node reset-root-password.cjs [root新密码]');
  return args[0] ?? DEFAULT_ROOT_PASSWORD;
};
