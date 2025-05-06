import { NullPermission } from '../constant';
import { type PerConstructPros, Permission } from '../controller';
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
