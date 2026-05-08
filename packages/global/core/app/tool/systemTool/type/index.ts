/**
 * 系统工具的类型，按照业务分类有 list 和 detail 两种类型，原则上 list 尽量少字段，detail 的字段比较全
 * 按照使用场景分：
 * 1. 基础类型 所有场景下都需要的基础类型
 * 2. admin 管理员：不需要 input/output 等信息，只需要价格配置、系统密钥等配置字段
 * 3. team 视角：不需要 userTags 等配置字段（已经筛选过），需要 input/output，用于渲染
 * 4. runtime 运行时：主要是计费和反向调用
 * 5. 插件市场：基本等同于 team 的，需要下载量等
 */

// 基础的
export {
  SystemToolBaseSchema,
  SystemToolListItemSchema,
  SystemToolDetailSchema,
  SystemToolChildDetailSchema
} from './base';
export type { SystemToolListItemType, SystemToolDetailType } from './base';

// Admin 视角的
export {
  AdminSystemToolListItemSchema,
  AdminSystemToolDetailSchema,
  AdminSystemToolChildDetailSchema
} from './admin';
export type {
  AdminSystemToolDetailType,
  AdminSystemToolListItemType,
  AdminSystemToolChildDetailType
} from './admin';
