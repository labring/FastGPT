import { NullRoleVal } from '../constant';
import { type PerConstructPros, Permission } from '../controller';
export class DatasetPermission extends Permission {
  constructor(props?: PerConstructPros) {
    if (!props) {
      props = {
        per: NullRoleVal
      };
    } else if (!props?.per) {
      props.per = NullRoleVal;
    }
    super(props);
  }
}
