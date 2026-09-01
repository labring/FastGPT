import { type PerConstructPros, Permission } from '../controller';

/**
 * Collection-level permission helper.
 *
 * Collection permissions use the common role/permission lists
 * (read / write / manage), which is the same default used by `Permission`,
 * so no extra role mapping is required.
 */
export class CollectionPermission extends Permission {
  constructor(props?: PerConstructPros) {
    super(props);
  }
}
