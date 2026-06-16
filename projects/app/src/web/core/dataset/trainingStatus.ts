import {
  CollectionTrainingStatusEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import type { TFunction } from 'next-i18next';
import type { ColorSchemaType } from '@fastgpt/web/components/common/Tag';

/**
 * 根据训练模式获取对应的阶段文本描述
 * @param mode - 训练模式枚举，若未提供则返回“等待中”
 * @returns 国际化后的阶段文本字符串
 */
export const getTrainingStageText = (mode?: TrainingModeEnum) => {
  const textMap = {
    [TrainingModeEnum.parse]: i18nT('dataset:process.Parsing'),
    [TrainingModeEnum.imageParse]: i18nT('dataset:process.Parse_Image'),
    [TrainingModeEnum.qa]: i18nT('dataset:process.Get QA'),
    [TrainingModeEnum.image]: i18nT('dataset:process.Image_Index'),
    [TrainingModeEnum.auto]: i18nT('dataset:process.Auto_Index'),
    [TrainingModeEnum.chunk]: i18nT('dataset:process.Vectorizing')
  };

  return mode ? textMap[mode] : i18nT('dataset:process.Waiting');
};

/**
 * 根据集合中最慢的训练任务和状态，获取整体训练状态文本
 * @param params.slowestTrainingMode - 最慢任务的训练模式
 * @param params.slowestTrainingStatus - 最慢任务的训练状态
 * @returns 国际化后的状态文本（错误/进行中具体阶段/等待中/已就绪）
 */
export const getCollectionTrainingStatusText = ({
  slowestTrainingMode,
  slowestTrainingStatus
}: {
  slowestTrainingMode?: TrainingModeEnum;
  slowestTrainingStatus?: CollectionTrainingStatusEnum;
}) => {
  if (slowestTrainingStatus === CollectionTrainingStatusEnum.error) {
    return i18nT('dataset:training.status_error');
  }

  if (slowestTrainingStatus === CollectionTrainingStatusEnum.running && slowestTrainingMode) {
    return getTrainingStageText(slowestTrainingMode);
  }

  if (slowestTrainingStatus === CollectionTrainingStatusEnum.running) {
    return i18nT('dataset:process.Waiting');
  }

  return i18nT('dataset:process.Is_Ready');
};

/**
 * 使用传入的翻译函数格式化训练阶段文本
 * @param mode - 训练模式枚举
 * @param t - i18next 翻译函数实例
 * @returns 国际化后的阶段文本字符串
 */
export const formatTrainingStageText = (mode: TrainingModeEnum | undefined, t: TFunction) => {
  return t(getTrainingStageText(mode) as any);
};

/**
 * 根据集合中最慢的训练任务和状态，获取状态标签的颜色主题
 * @param params.slowestTrainingMode - 最慢任务的训练模式
 * @param params.slowestTrainingStatus - 最慢任务的训练状态
 * @returns MyTag 可消费的颜色主题名
 */
export const getCollectionTrainingStatusColorSchema = ({
  slowestTrainingMode,
  slowestTrainingStatus
}: {
  slowestTrainingMode?: TrainingModeEnum;
  slowestTrainingStatus?: CollectionTrainingStatusEnum;
}): ColorSchemaType => {
  if (slowestTrainingStatus === CollectionTrainingStatusEnum.error) {
    return 'lightRed';
  }

  if (slowestTrainingStatus !== CollectionTrainingStatusEnum.running) {
    return 'green';
  }

  switch (slowestTrainingMode) {
    case TrainingModeEnum.parse:
    case TrainingModeEnum.imageParse:
      return 'blue';
    case TrainingModeEnum.qa:
    case TrainingModeEnum.image:
    case TrainingModeEnum.auto:
      return 'cyan';
    case TrainingModeEnum.chunk:
      return 'adora';
    default:
      return 'lightGray';
  }
};
