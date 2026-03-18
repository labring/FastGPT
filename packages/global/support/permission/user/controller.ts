import { type PerConstructPros, Permission } from '../controller';
import {
  TeamApikeyCreateRoleVal,
  TeamAppCreateRoleVal,
  TeamDatasetCreateRoleVal,
  TeamSkillCreateRoleVal,
  TeamDefaultRoleVal,
  TeamPerList,
  TeamRoleList,
  TeamRolePerMap
} from './constant';

export class TeamPermission extends Permission {
  hasAppCreateRole: boolean = false;
  hasDatasetCreateRole: boolean = false;
  hasApikeyCreateRole: boolean = false;
  hasSkillCreateRole: boolean = false;
  hasAppCreatePer: boolean = false;
  hasDatasetCreatePer: boolean = false;
  hasApikeyCreatePer: boolean = false;
  hasSkillCreatePer: boolean = false;

  constructor(props?: PerConstructPros) {
    if (!props) {
      props = {
        role: TeamDefaultRoleVal
      };
    } else if (!props?.role) {
      props.role = TeamDefaultRoleVal;
    }
    props.roleList = TeamRoleList;
    props.rolePerMap = TeamRolePerMap;
    props.perList = TeamPerList;
    super(props);

    this.setUpdatePermissionCallback(() => {
      this.hasAppCreateRole = this.checkRole(TeamAppCreateRoleVal);
      this.hasDatasetCreateRole = this.checkRole(TeamDatasetCreateRoleVal);
      this.hasApikeyCreateRole = this.checkRole(TeamApikeyCreateRoleVal);
      this.hasSkillCreateRole = this.checkRole(TeamSkillCreateRoleVal);
      this.hasAppCreatePer = this.checkPer(TeamAppCreateRoleVal);
      this.hasDatasetCreatePer = this.checkPer(TeamDatasetCreateRoleVal);
      this.hasApikeyCreatePer = this.checkPer(TeamApikeyCreateRoleVal);
      this.hasSkillCreatePer = this.checkPer(TeamSkillCreateRoleVal);
    });
  }
}
