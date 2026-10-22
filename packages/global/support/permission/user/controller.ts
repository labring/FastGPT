import { type PerConstructPros, Permission } from '../controller';
import {
  TeamApikeyCreateRoleVal,
  TeamAppCreateRoleVal,
  TeamDatasetCreateRoleVal,
  TeamSkillCreateRoleVal,
  TeamModelCreateRoleVal,
  TeamApikeyCreatePermissionVal,
  TeamAppCreatePermissionVal,
  TeamDatasetCreatePermissionVal,
  TeamSkillCreatePermissionVal,
  TeamModelCreatePermissionVal,
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
  hasModelCreateRole: boolean = false;
  hasAppCreatePer: boolean = false;
  hasDatasetCreatePer: boolean = false;
  hasApikeyCreatePer: boolean = false;
  hasSkillCreatePer: boolean = false;
  hasModelCreatePer: boolean = false;

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
      this.hasModelCreateRole = this.checkRole(TeamModelCreateRoleVal);
      this.hasAppCreatePer = this.checkPer(TeamAppCreatePermissionVal);
      this.hasDatasetCreatePer = this.checkPer(TeamDatasetCreatePermissionVal);
      this.hasApikeyCreatePer = this.checkPer(TeamApikeyCreatePermissionVal);
      this.hasSkillCreatePer = this.checkPer(TeamSkillCreatePermissionVal);
      this.hasModelCreatePer = this.checkPer(TeamModelCreatePermissionVal);
    });
  }
}
