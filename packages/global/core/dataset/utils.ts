import { TrainingModeEnum, DatasetCollectionTypeEnum } from './constants';
import { getFileIcon } from '../../common/file/icon';
import { strIsLink } from '../../common/string/tools';
import { DatasetDataIndexTypeEnum } from './data/constants';

export function getCollectionIcon(
  type: DatasetCollectionTypeEnum = DatasetCollectionTypeEnum.file,
  name = ''
) {
  if (type === DatasetCollectionTypeEnum.folder) {
    return 'common/folderFill';
  }
  if (type === DatasetCollectionTypeEnum.link) {
    return 'common/linkBlue';
  }
  if (type === DatasetCollectionTypeEnum.virtual) {
    return 'file/fill/manual';
  }
  return getFileIcon(name);
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

/* get dataset data default index */
export function getDefaultIndex(props?: { q?: string; a?: string }) {
  const { q = '', a } = props || {};

  return [
    {
      text: q,
      type: DatasetDataIndexTypeEnum.default
    },
    ...(a
      ? [
          {
            text: a,
            type: DatasetDataIndexTypeEnum.default
          }
        ]
      : [])
  ];
}

export const predictDataLimitLength = (mode: TrainingModeEnum, data: any[]) => {
  if (mode === TrainingModeEnum.qa) return data.length * 20;
  if (mode === TrainingModeEnum.auto) return data.length * 5;
  return data.length;
};
