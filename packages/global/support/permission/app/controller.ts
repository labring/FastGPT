import { type PerConstructPros, Permission } from '../controller';
import { AppDefaultRoleVal, AppPerList, AppRoleList, AppRolePerMap } from './constant';

export class AppPermission extends Permission {
  hasReadChatLogPer: boolean = false;
  hasReadChatLogRole: boolean = false;
  constructor(props?: PerConstructPros) {
    if (!props) {
      props = {
        role: AppDefaultRoleVal
      };
    } else if (!props?.role) {
      props.role = AppDefaultRoleVal;
    }
    props.roleList = AppRoleList;
    props.rolePerMap = AppRolePerMap;
    props.perList = AppPerList;
    super(props);

    this.setUpdatePermissionCallback(() => {
      this.hasReadChatLogPer = this.checkPer(AppPerList.readChatLog);
      this.hasReadChatLogRole = this.checkRole(AppRoleList.readChatLog.value);
    });
  }
}
