import type { ModelHandle } from './handle';

let systemHandle: ModelHandle | undefined;

/** 目录加载器内部读取已发布快照；业务入口必须先执行数据库修订号检查。 */
export const getCachedSystemModelHandle = () => systemHandle;

/** 原子发布完整系统快照，已发出的不可变 handle 不会被后续发布修改。 */
export const publishSystemModelHandle = (handle: ModelHandle | undefined) => {
  systemHandle = handle;
};
