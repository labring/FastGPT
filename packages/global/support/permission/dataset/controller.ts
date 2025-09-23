import { type PerConstructPros, Permission } from '../controller';
import {
  DataSetDefaultRoleVal,
  DatasetPerList,
  DatasetRoleList,
  DatasetRolePerMap
} from './constant';
export class DatasetPermission extends Permission {
  constructor(props?: PerConstructPros) {
    if (!props) {
      props = {
        role: DataSetDefaultRoleVal
      };
    } else if (!props?.role) {
      props.role = DataSetDefaultRoleVal;
    }
    props.roleList = DatasetRoleList;
    props.rolePerMap = DatasetRolePerMap;
    props.perList = DatasetPerList;
    super(props);
  }
}
