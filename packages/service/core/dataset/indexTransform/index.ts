/**
 * Dataset Index Transform Module
 * 数据集索引转换模块
 *
 * 提供同义词标准化转换工具函数
 */

// Utils - 核心转换算法
export {
  applySynonymTransform,
  buildSynonymDict,
  validateTransformation,
  type SynonymTransformResult,
  type TransformationRecordType
} from './utils';
