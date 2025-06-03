import { TrainingModeEnum, DatasetCollectionTypeEnum } from './constants';
import { getFileIcon } from '../../common/file/icon';
import { strIsLink } from '../../common/string/tools';

export function getCollectionIcon({
  type = DatasetCollectionTypeEnum.file,
  name = '',
  sourceId
}: {
  type?: DatasetCollectionTypeEnum;
  name?: string;
  sourceId?: string;
}) {
  if (type === DatasetCollectionTypeEnum.folder) {
    return 'common/folderFill';
  }
  if (type === DatasetCollectionTypeEnum.link) {
    return 'common/linkBlue';
  }
  if (type === DatasetCollectionTypeEnum.virtual) {
    return 'file/fill/manual';
  }
  if (type === DatasetCollectionTypeEnum.images) {
    return 'core/dataset/imageFill';
  }
  return getSourceNameIcon({ sourceName: name, sourceId });
}
export function getSourceNameIcon({
  sourceName,
  sourceId
}: {
  sourceName: string;
  sourceId?: string;
}) {
  try {
    const fileIcon = getFileIcon(decodeURIComponent(sourceName.replace(/%/g, '%25')), '');
    if (fileIcon) {
      return fileIcon;
    }
    if (strIsLink(sourceId)) {
      return 'common/linkBlue';
    }
  } catch (error) {}

  return 'file/fill/file';
}

export const predictDataLimitLength = (mode: TrainingModeEnum, data: any[]) => {
  if (mode === TrainingModeEnum.qa) return data.length * 20;
  if (mode === TrainingModeEnum.auto) return data.length * 5;
  if (mode === TrainingModeEnum.image) return data.length * 2;
  return data.length;
};
