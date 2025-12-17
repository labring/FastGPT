/**
 * 文本转换记录（单个转换项）
 * 记录一次同义词替换的详细信息
 */
export type TransformationRecordType = {
  // 在原始文本中的位置信息
  originalStartPos: number; // 原始文本中的起始位置（字符索引）
  originalEndPos: number; // 原始文本中的结束位置（字符索引）
  originalTerm: string; // 原始词汇（非标准词）

  // 在转换后文本中的位置信息
  transformedStartPos: number; // 转换后文本中的起始位置（字符索引）
  transformedEndPos: number; // 转换后文本中的结束位置（字符索引）
  standardizedTerm: string; // 标准化词

  // 关联信息
  synonymMappingId: string; // 关联的同义词映射记录ID（MongoSynonymMapping._id）
};

/**
 * 同义词转换结果
 */
export interface SynonymTransformResult {
  transformedText: string;
  transformations: TransformationRecordType[];
}

import { strategyRegistry } from './strategies';

/**
 * 应用同义词转换，生成标准化文本和转换记录
 *
 * 使用策略模式，支持多种替换策略，方便后续迭代优化
 *
 * @param originalText 原始文本
 * @param synonymDict 同义词字典 {标准词: [同义词数组]}
 * @param synonymMappingMap 同义词映射ID映射表 {originalTerm: synonymMappingId}
 * @param strategyName 策略名称（可选，默认使用智能边界策略）
 * @returns 转换结果 {transformedText, transformations}
 *
 * @example
 * const originalText = "我爱信服，信服的产品很好用";
 * const synonymDict = { "深信服": ["信服", "sanfor"] };
 * const synonymMappingMap = { "信服": "mapping-id-1", "sanfor": "mapping-id-1" };
 *
 * // 使用默认策略（智能边界）
 * const result = applySynonymTransform(originalText, synonymDict, synonymMappingMap);
 *
 * // 指定策略
 * const result2 = applySynonymTransform(originalText, synonymDict, synonymMappingMap, 'simple-regex');
 */
export function applySynonymTransform(
  originalText: string,
  synonymDict: Record<string, string[]>,
  synonymMappingMap: Record<string, string>,
  strategyName?: string
): SynonymTransformResult {
  // 获取策略并执行转换
  const strategy = strategyRegistry.getStrategy(strategyName);
  return strategy.transform(originalText, synonymDict, synonymMappingMap);
}

/**
 * 构建同义词字典和映射表
 * 从同义词映射数据构建用于转换的字典和映射表
 *
 * @param synonymMappings 同义词映射数据数组
 * @returns {synonymDict, synonymMappingMap}
 *
 * @example
 * const synonymMappings = [
 *   {
 *     _id: "mapping-id-1",
 *     standardizedTerm: "深信服",
 *     synonymTerms: ["信服", "sanfor"]
 *   }
 * ];
 * const { synonymDict, synonymMappingMap } = buildSynonymDict(synonymMappings);
 * // synonymDict => { "深信服": ["信服", "sanfor"] }
 * // synonymMappingMap => { "信服": "mapping-id-1", "sanfor": "mapping-id-1" }
 */
export function buildSynonymDict(
  synonymMappings: Array<{
    _id: string;
    standardizedTerm: string;
    synonymTerms: string[];
  }>
): {
  synonymDict: Record<string, string[]>;
  synonymMappingMap: Record<string, string>;
} {
  const synonymDict: Record<string, string[]> = {};
  const synonymMappingMap: Record<string, string> = {};

  for (const mapping of synonymMappings) {
    const { _id, standardizedTerm, synonymTerms } = mapping;

    // 构建字典
    if (!synonymDict[standardizedTerm]) {
      synonymDict[standardizedTerm] = [];
    }
    synonymDict[standardizedTerm].push(...synonymTerms);

    // 构建映射表（同义词 -> mapping ID）
    for (const synonym of synonymTerms) {
      synonymMappingMap[synonym] = _id;
    }
  }

  return { synonymDict, synonymMappingMap };
}

/**
 * 验证转换的正确性
 * 通过正向转换后再逆向恢复，验证是否能完全恢复原始文本
 *
 * @param originalText 原始文本
 * @param synonymDict 同义词字典
 * @param synonymMappingMap 同义词映射表
 * @returns 是否转换正确
 */
export function validateTransformation(
  originalText: string,
  synonymDict: Record<string, string[]>,
  synonymMappingMap: Record<string, string>
): boolean {
  const { transformedText, transformations } = applySynonymTransform(
    originalText,
    synonymDict,
    synonymMappingMap
  );
  const restoredText = restoreOriginalText(transformedText, transformations);
  return restoredText === originalText;
}

/**
 * 根据转换记录恢复原始文本
 * 按transformedStartPos降序排列（从后向前恢复，避免位置偏移影响）
 *
 * @param transformedText 转换后的文本
 * @param transformations 转换记录数组
 * @returns 原始文本
 *
 * @example
 * const transformedText = "我爱深信服，深信服的产品很好用";
 * const transformations = [
 *   {
 *     originalStartPos: 2,
 *     originalEndPos: 4,
 *     originalTerm: "信服",
 *     transformedStartPos: 2,
 *     transformedEndPos: 5,
 *     standardizedTerm: "深信服",
 *     synonymMappingId: "mapping-id-1"
 *   },
 *   ...
 * ];
 * const restored = restoreOriginalText(transformedText, transformations);
 * // restored => "我爱信服，信服的产品很好用"
 */
export function restoreOriginalText(
  transformedText: string,
  transformations: TransformationRecordType[]
): string {
  // 按transformedStartPos降序排列（从后向前恢复，避免位置偏移影响）
  const sortedTransforms = [...transformations].sort(
    (a, b) => b.transformedStartPos - a.transformedStartPos
  );

  let result = transformedText;

  // 从后向前依次恢复
  for (const transform of sortedTransforms) {
    const { transformedStartPos, transformedEndPos, originalTerm } = transform;

    // 替换：将标准词换回原始词
    const before = result.substring(0, transformedStartPos);
    const after = result.substring(transformedEndPos);
    result = before + originalTerm + after;
  }

  return result;
}
