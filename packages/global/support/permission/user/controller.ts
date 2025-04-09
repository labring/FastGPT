import { PerConstructPros, Permission } from '../controller';
import {
  TeamAppCreatePermissionVal,
  TeamDefaultPermissionVal,
  TeamPermissionList
} from './constant';

export class TeamPermission extends Permission {
  hasAppCreatePer: boolean = false;
  hasDatasetCreatePer: boolean = false;
  hasApikeyCreatePer: boolean = false;

  constructor(props?: PerConstructPros) {
    if (!props) {
      props = {
        per: TeamDefaultPermissionVal
      };
    } else if (!props?.per) {
      props.per = TeamDefaultPermissionVal;
    }
    props.permissionList = TeamPermissionList;
    super(props);

    this.setUpdatePermissionCallback(() => {
      this.hasAppCreatePer = this.checkPer(TeamAppCreatePermissionVal);
      this.hasDatasetCreatePer = this.checkPer(TeamAppCreatePermissionVal);
      this.hasApikeyCreatePer = this.checkPer(TeamAppCreatePermissionVal);
    });
  }
}
