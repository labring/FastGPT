import { PerConstructPros, Permission } from '../controller';
import { TeamDefaultPermissionVal } from './constant';

export class TeamPermission extends Permission {
  constructor(props?: PerConstructPros) {
    if (!props) {
      props = {
        per: TeamDefaultPermissionVal
      };
    } else if (!props?.per) {
      props.per = TeamDefaultPermissionVal;
    }
    super(props);
  }
}
