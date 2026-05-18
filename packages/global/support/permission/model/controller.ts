import { type PerConstructPros, Permission } from '../controller';
import {
  ModelDefaultRoleVal,
  ModelPerList,
  ModelRoleList,
  ModelRolePerMap
} from './constant';
export class ModelPermission extends Permission {
  constructor(props?: PerConstructPros) {
    if (!props) {
      props = {
        role: ModelDefaultRoleVal
      };
    } else if (!props?.role) {
      props.role = ModelDefaultRoleVal;
    }
    props.roleList = ModelRoleList;
    props.rolePerMap = ModelRolePerMap;
    props.perList = ModelPerList;
    super(props);
  }
}
