/**
 * 同义词替换策略模式
 *
 * 设计目标：
 * 1. 支持多种替换策略，方便后续迭代优化
 * 2. 策略可配置、可切换
 * 3. 保持统一的接口和转换记录格式
 */

import type { TransformationRecordType, SynonymTransformResult } from './utils';

/**
 * 同义词替换策略接口
 */
export interface SynonymReplacementStrategy {
  /**
   * 策略名称
   */
  name: string;

  /**
   * 策略描述
   */
  description: string;

  /**
   * 执行同义词替换
   *
   * @param originalText 原始文本
   * @param synonymDict 同义词字典 {标准词: [同义词数组]}
   * @param synonymMappingMap 同义词映射ID映射表 {同义词: synonymMappingId}
   * @returns 转换结果 {transformedText, transformations}
   */
  transform(
    originalText: string,
    synonymDict: Record<string, string[]>,
    synonymMappingMap: Record<string, string>
  ): SynonymTransformResult;
}

/**
 * 匹配项接口（内部使用）
 */
export interface MatchItem {
  start: number;
  end: number;
  alias: string;
  stdName: string;
  length: number;
  matchedText: string;
  synonymMappingId: string;
}

/**
 * 检查是否为版本号格式 (如: v1.2.3, 111.222.333)
 */
export function isVersionFormat(text: string): boolean {
  return /^v?[0-9]{1,3}(\.[0-9]{0,3}){0,2}/.test(text);
}

/**
 * 智能边界替换策略（当前默认策略）
 *
 * 特点：
 * 1. 智能边界检测（字母、数字、版本号）
 * 2. 重叠匹配处理（长词优先）
 * 3. 避免相邻重复替换
 * 4. 大小写不敏感
 */
export class SmartBoundaryStrategy implements SynonymReplacementStrategy {
  name = 'smart-boundary';
  description = '智能边界检测策略，支持版本号识别、重叠处理、长词优先';

  transform(
    originalText: string,
    synonymDict: Record<string, string[]>,
    synonymMappingMap: Record<string, string>
  ): SynonymTransformResult {
    if (!originalText || !synonymDict || Object.keys(synonymDict).length === 0) {
      return { transformedText: originalText, transformations: [] };
    }

    // 第一步：收集所有匹配
    const allMatches: MatchItem[] = this.collectMatches(
      originalText,
      synonymDict,
      synonymMappingMap
    );

    if (allMatches.length === 0) {
      return { transformedText: originalText, transformations: [] };
    }

    // 第二步：按长度降序排序，优先处理长匹配
    allMatches.sort((a, b) => b.length - a.length);

    // 第三步：应用智能去重策略 - 处理重叠匹配
    const finalMatches = this.deduplicateOverlappingMatches(allMatches);

    // 第四步：避免相邻词的重复替换
    const filteredMatches = this.filterAdjacentDuplicates(finalMatches);

    // 第五步：构建转换记录并执行替换
    return this.applyReplacements(originalText, filteredMatches);
  }

  /**
   * 收集所有匹配项
   */
  private collectMatches(
    originalText: string,
    synonymDict: Record<string, string[]>,
    synonymMappingMap: Record<string, string>
  ): MatchItem[] {
    const allMatches: MatchItem[] = [];

    for (const [stdName, aliasList] of Object.entries(synonymDict)) {
      for (const alias of aliasList) {
        // 使用正则表达式查找所有匹配（不区分大小写）
        // 使用负向后顾断言 (?<!\w) 确保前面不是字母数字下划线
        const escapedAlias = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(`(?<!\\w)${escapedAlias}`, 'gi');

        let match: RegExpExecArray | null;
        while ((match = pattern.exec(originalText)) !== null) {
          const start = match.index;
          const end = start + match[0].length;

          // 智能边界验证
          if (this.validateBoundary(originalText, start, end)) {
            allMatches.push({
              start,
              end,
              alias,
              stdName,
              length: match[0].length,
              matchedText: match[0],
              synonymMappingId: synonymMappingMap[alias] || ''
            });
          }
        }
      }
    }

    return allMatches;
  }

  /**
   * 验证边界是否有效
   */
  private validateBoundary(text: string, start: number, end: number): boolean {
    const beforeChar = start > 0 ? text[start - 1] : ' ';
    const afterChar = end < text.length ? text[end] : ' ';
    const afterChars = text.substring(end, Math.min(end + 12, text.length));

    // 检查是否跟随版本号 (如: AFv1.2.3, AF111.222.333)
    const isFollowVersion = isVersionFormat(afterChars);

    // 智能边界处理（与旧逻辑保持一致）：
    // - 前面不能是字母（但可以是数字、空格、标点、括号等）
    // - 后面不能是字母（除非是版本号格式），但可以是数字、标点等
    const validBefore = !/[a-zA-Z]/.test(beforeChar);
    const validAfter = !/[a-zA-Z]/.test(afterChar) || isFollowVersion;

    return validBefore && validAfter;
  }

  /**
   * 去重重叠匹配
   */
  private deduplicateOverlappingMatches(matches: MatchItem[]): MatchItem[] {
    const finalMatches: MatchItem[] = [];
    const occupiedRanges: Array<[number, number]> = [];

    for (const matchItem of matches) {
      const { start, end } = matchItem;

      // 检查是否与已选择的匹配重叠
      const hasOverlap = occupiedRanges.some(([occStart, occEnd]) => {
        return !(end <= occStart || start >= occEnd);
      });

      if (!hasOverlap) {
        finalMatches.push(matchItem);
        occupiedRanges.push([start, end]);
      }
    }

    return finalMatches;
  }

  /**
   * 过滤相邻重复
   */
  private filterAdjacentDuplicates(matches: MatchItem[]): MatchItem[] {
    // 先按位置排序
    matches.sort((a, b) => a.start - b.start);

    const filteredMatches: MatchItem[] = [];
    for (let i = 0; i < matches.length; i++) {
      const current = matches[i];
      let shouldSkip = false;

      // 检查是否与前一个匹配相邻且指向同一标准词
      if (i > 0) {
        const prev = matches[i - 1];
        if (current.stdName === prev.stdName && current.start === prev.end) {
          // 如果当前匹配比前一个短或相等，跳过
          if (current.length <= prev.length) {
            shouldSkip = true;
          }
        }
      }

      if (!shouldSkip) {
        filteredMatches.push(current);
      }
    }

    return filteredMatches;
  }

  /**
   * 应用替换
   */
  private applyReplacements(originalText: string, matches: MatchItem[]): SynonymTransformResult {
    const transformations: TransformationRecordType[] = [];
    let transformedText = originalText;

    // 按位置从后往前排序，避免替换时位置偏移影响
    const sortedMatches = [...matches].sort((a, b) => b.start - a.start);

    // 为了正确计算 transformedStartPos/EndPos，需要按正序遍历计算偏移
    let offset = 0;
    for (let i = 0; i < matches.length; i++) {
      const matchItem = matches[i];

      // 跳过无意义的替换（不记录转换信息，因为没有实际替换）
      if (matchItem.matchedText === matchItem.stdName) {
        continue;
      }

      // 记录转换信息
      transformations.push({
        originalStartPos: matchItem.start,
        originalEndPos: matchItem.end,
        originalTerm: matchItem.matchedText,
        transformedStartPos: matchItem.start + offset,
        transformedEndPos: matchItem.start + offset + matchItem.stdName.length,
        standardizedTerm: matchItem.stdName,
        synonymMappingId: matchItem.synonymMappingId
      });

      // 累计偏移量
      offset += matchItem.stdName.length - matchItem.length;
    }

    // 从后往前执行替换
    for (const matchItem of sortedMatches) {
      // 优化：跳过无意义的替换（当匹配文本和标准词相同时）
      if (matchItem.matchedText === matchItem.stdName) {
        continue;
      }

      const before = transformedText.substring(0, matchItem.start);
      const after = transformedText.substring(matchItem.end);
      transformedText = before + matchItem.stdName + after;
    }

    // 注意：不做后处理去重，以保证 transformations 中的位置信息准确
    // 如果原文中有相邻的同义词（如 "信服 sangfor"），替换后会变成 "深信服 深信服"
    // 这种情况很少见，且保留位置信息对于恢复原文更重要

    return { transformedText, transformations };
  }
}

/**
 * 策略注册表
 */
export class StrategyRegistry {
  private strategies: Map<string, SynonymReplacementStrategy> = new Map();
  private defaultStrategy: string = 'smart-boundary';

  constructor() {
    // 注册内置策略
    this.register(new SmartBoundaryStrategy());
  }

  /**
   * 注册策略
   */
  register(strategy: SynonymReplacementStrategy): void {
    this.strategies.set(strategy.name, strategy);
  }

  /**
   * 获取策略
   */
  getStrategy(name?: string): SynonymReplacementStrategy {
    const strategyName = name || this.defaultStrategy;
    const strategy = this.strategies.get(strategyName);

    if (!strategy) {
      throw new Error(`Strategy "${strategyName}" not found`);
    }

    return strategy;
  }

  /**
   * 设置默认策略
   */
  setDefaultStrategy(name: string): void {
    if (!this.strategies.has(name)) {
      throw new Error(`Strategy "${name}" not found`);
    }
    this.defaultStrategy = name;
  }

  /**
   * 获取所有可用策略
   */
  getAllStrategies(): Array<{ name: string; description: string }> {
    return Array.from(this.strategies.values()).map((strategy) => ({
      name: strategy.name,
      description: strategy.description
    }));
  }
}

// 全局策略注册表单例
export const strategyRegistry = new StrategyRegistry();
