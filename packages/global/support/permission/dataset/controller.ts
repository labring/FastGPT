import { NullPermission } from '../constant';
import { PerConstructPros, Permission } from '../controller';
export class DatasetPermission extends Permission {
  constructor(props?: PerConstructPros) {
    if (!props) {
      props = {
        per: NullPermission
      };
    } else if (!props?.per) {
      props.per = NullPermission;
    }
    super(props);
  }
}
