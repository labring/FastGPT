import { type PerConstructPros, Permission } from '../controller';
import {
  EvaluationDefaultRoleVal,
  EvaluationPerList,
  EvaluationRoleList,
  EvaluationRolePerMap
} from './constant';

export class EvaluationPermission extends Permission {
  constructor(props?: PerConstructPros) {
    if (!props) {
      props = {
        role: EvaluationDefaultRoleVal
      };
    } else if (!props?.role) {
      props.role = EvaluationDefaultRoleVal;
    }
    props.roleList = EvaluationRoleList;
    props.rolePerMap = EvaluationRolePerMap;
    props.perList = EvaluationPerList;
    super(props);
  }
}
