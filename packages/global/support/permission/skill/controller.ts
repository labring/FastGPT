import { type PerConstructPros, Permission } from '../controller';
import { SkillDefaultRoleVal, SkillPerList, SkillRoleList, SkillRolePerMap } from './constant';

export class SkillPermission extends Permission {
  constructor(props?: PerConstructPros) {
    if (!props) {
      props = { role: SkillDefaultRoleVal };
    } else if (!props?.role) {
      props.role = SkillDefaultRoleVal;
    }
    props.roleList = SkillRoleList;
    props.rolePerMap = SkillRolePerMap;
    props.perList = SkillPerList;
    super(props);
  }
}
