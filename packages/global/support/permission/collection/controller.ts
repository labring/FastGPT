import { type PerConstructPros, Permission } from '../controller';
import {
  CollectionDefaultRoleVal,
  CollectionPerList,
  CollectionRoleList,
  CollectionRolePerMap
} from './constant';

/**
 * Collection-level permission helper.
 *
 * Collection permissions reuse the common role/permission values
 * (read / write / manage), but the role descriptions are collection-scoped
 * so the UI does not describe collection permissions with dataset wording.
 */
export class CollectionPermission extends Permission {
  constructor(props?: PerConstructPros) {
    if (!props) {
      props = {
        role: CollectionDefaultRoleVal
      };
    } else if (!props?.role) {
      props.role = CollectionDefaultRoleVal;
    }
    props.roleList = CollectionRoleList;
    props.rolePerMap = CollectionRolePerMap;
    props.perList = CollectionPerList;
    super(props);
  }
}
