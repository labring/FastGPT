import { PerConstructPros, Permission } from '../controller';
import { AppDefaultPermission } from './constant';

export class AppPermission extends Permission {
  constructor(props?: PerConstructPros) {
    if (!props) {
      props = {
        per: AppDefaultPermission
      };
    } else if (!props?.per) {
      props.per = AppDefaultPermission;
    }
    super(props);
  }
}
