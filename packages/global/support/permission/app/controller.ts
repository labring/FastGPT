import { type PerConstructPros, Permission } from '../controller';
import { AppDefaultPermissionVal, AppPermissionList } from './constant';

export class AppPermission extends Permission {
  hasLogPer: boolean = false;
  constructor(props?: PerConstructPros) {
    if (!props) {
      props = {
        per: AppDefaultPermissionVal
      };
    } else if (!props?.per) {
      props.per = AppDefaultPermissionVal;
    }
    super(props);
    this.setUpdatePermissionCallback(() => {
      this.hasReadPer = this.checkPer(AppPermissionList.read.value);
      this.hasWritePer = this.checkPer(AppPermissionList.write.value);
      this.hasManagePer = this.checkPer(AppPermissionList.manage.value);
      this.hasLogPer = this.checkPer(AppPermissionList.log.value);
    });
  }
}
