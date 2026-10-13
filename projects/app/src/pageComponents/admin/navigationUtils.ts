import type { SecondaryNavigationTab } from '@/pageComponents/common/SecondaryNavigationContainer';

/** Filters admin navigation to allowed routes and flattens allowed children. */
export const getUnlicensedAdminTabs = <ValueType extends string>(
  tabs: SecondaryNavigationTab<ValueType>[],
  allowedRoutes: readonly ValueType[]
): SecondaryNavigationTab<ValueType>[] =>
  allowedRoutes.flatMap((route) => {
    const matchingChildren = tabs.flatMap(
      (item) => item.children?.filter((child) => child.value === route) ?? []
    );
    if (matchingChildren.length > 0) return matchingChildren;

    const tab = tabs.find((item) => item.value === route);
    return tab ? [tab] : [];
  });
