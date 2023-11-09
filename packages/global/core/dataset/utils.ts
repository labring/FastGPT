import { DatasetCollectionTypeEnum } from './constant';
import { getFileIcon } from '../../common/file/icon';
import { strIsLink } from '../../common/string/tools';

export function getCollectionIcon(
  type: `${DatasetCollectionTypeEnum}` = DatasetCollectionTypeEnum.file,
  name = ''
) {
  if (type === DatasetCollectionTypeEnum.folder) {
    return '/imgs/files/folder.svg';
  }
  if (type === DatasetCollectionTypeEnum.link) {
    return '/imgs/files/link.svg';
  }
  if (type === DatasetCollectionTypeEnum.virtual) {
    if (name === '手动录入') {
      return '/imgs/files/manual.svg';
    } else if (name === '手动标注') {
      return '/imgs/files/mark.svg';
    }
    return '/imgs/files/collection.svg';
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
  if (strIsLink(sourceId)) {
    return '/imgs/files/link.svg';
  }
  const fileIcon = getFileIcon(sourceName, '');
  if (fileIcon) {
    return fileIcon;
  }

  if (sourceName === '手动录入') {
    return '/imgs/files/manual.svg';
  } else if (sourceName === '手动标注') {
    return '/imgs/files/mark.svg';
  }
  return '/imgs/files/collection.svg';
}
