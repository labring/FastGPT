import { PerConstructPros, Permission } from '../controller';
import { AppDefaultPermissionVal } from './constant';

export class AppPermission extends Permission {
  constructor(props?: PerConstructPros) {
    if (!props) {
      props = {
        per: AppDefaultPermissionVal
      };
    } else if (!props?.per) {
      props.per = AppDefaultPermissionVal;
    }
    super(props);
  }
}
