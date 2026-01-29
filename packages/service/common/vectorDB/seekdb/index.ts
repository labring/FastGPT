/**
 * SeekDB Vector Database Controller
 *
 * SeekDB 使用 MySQL 协议，与 OceanBase 完全兼容
 * 直接复用 OceanBase 的控制器实现
 */

import { ObClient, ObVectorCtrl } from '../oceanbase/controller';

// 导出 OceanBase 控制器（复用）
export { ObClient as SeekClient, ObVectorCtrl as SeekVectorCtrl } from '../oceanbase/controller';

// 导出类型
export type { VectorControllerType } from '../type';
