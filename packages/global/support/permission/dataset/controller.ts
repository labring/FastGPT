import { NullRoleVal } from '../constant';
import { type PerConstructPros, Permission } from '../controller';
import { DatasetPerList, DatasetRoleList, DatasetRolePerMap } from './constant';
export class DatasetPermission extends Permission {
  constructor(props?: PerConstructPros) {
    if (!props) {
      props = {
        role: NullRoleVal
      };
    } else if (!props?.role) {
      props.role = NullRoleVal;
    }
    props.roleList = DatasetRoleList;
    props.rolePerMap = DatasetRolePerMap;
    props.perList = DatasetPerList;
    super(props);
  }
}
