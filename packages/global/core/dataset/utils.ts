import { DatasetCollectionTypeEnum } from './constant';
import { getFileIcon } from '../../common/file/icon';

export function getCollectionIcon(
  type: `${DatasetCollectionTypeEnum}` = DatasetCollectionTypeEnum.file,
  name = ''
) {
  if (type === DatasetCollectionTypeEnum.folder) {
    return '/imgs/files/folder.svg';
  } else if (type === DatasetCollectionTypeEnum.link) {
    return '/imgs/files/link.svg';
  } else if (type === DatasetCollectionTypeEnum.virtual) {
    if (name === '手动录入') {
      return '/imgs/files/manual.svg';
    } else if (name === '手动标注') {
      return '/imgs/files/mark.svg';
    }
    return '/imgs/files/collection.svg';
  }
  return getFileIcon(name);
}
