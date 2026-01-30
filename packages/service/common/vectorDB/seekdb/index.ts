/**
 * SeekDB Vector Database Controller
 *
 * SeekDB 使用 MySQL 协议，与 OceanBase 完全兼容
 * 直接复用 OceanBase 的控制器实现
 */

import { ObClient } from '../oceanbase/controller';
import { ObVectorCtrl } from '../oceanbase';

// 导出 OceanBase 控制器（复用）
export { ObClient as SeekClient } from '../oceanbase/controller';
export { ObVectorCtrl as SeekVectorCtrl } from '../oceanbase';

// 导出类型
export type { VectorControllerType } from '../type';
