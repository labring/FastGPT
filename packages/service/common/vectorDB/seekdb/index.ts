/**
 * SeekDB Vector Database Controller
 *
 * SeekDB 使用 MySQL 协议，与 OceanBase 完全兼容
 * 直接复用 OceanBase 的控制器实现
 */

// 导出 OceanBase 控制器（复用）
export { ObVectorCtrl as SeekVectorCtrl } from '../oceanbase';

// 导出类型
export type { VectorControllerType } from '../type';
