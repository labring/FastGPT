import { i18nT } from '../../../common/i18n/utils';
import { CommonPerKeyEnum, CommonRoleList } from '../constant';

/**
 * Collection（知识库内的数据集/文件夹）级权限角色表。
 *
 * 与 `DatasetRoleList` 区分：描述文案面向单个 collection，而不是整个知识库。
 * 仅用于前端协作者面板的 roleList；服务端 `CollectionPermission` 继续使用 `Permission` 默认角色表。
 */
export const CollectionRoleList = {
  [CommonPerKeyEnum.read]: {
    ...CommonRoleList[CommonPerKeyEnum.read],
    description: i18nT('dataset:permission.collection.des.read')
  },
  [CommonPerKeyEnum.write]: {
    ...CommonRoleList[CommonPerKeyEnum.write],
    description: i18nT('dataset:permission.collection.des.write')
  },
  [CommonPerKeyEnum.manage]: {
    ...CommonRoleList[CommonPerKeyEnum.manage],
    description: i18nT('dataset:permission.collection.des.manage')
  }
};
