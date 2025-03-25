import { getOrgChildrenPath } from '@fastgpt/global/support/user/team/org/constant';
import { OrgListItemType } from '@fastgpt/global/support/user/team/org/type';
import { memo, useMemo, useState } from 'react';
import { useUserStore } from '../../../useUserStore';
import { ParentTreePathItemType } from '@fastgpt/global/common/parentFolder/type';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { getOrgList, getOrgMembers } from '../api';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';

function useOrg({ getPermission = true }: { getPermission?: boolean } = {}) {
  const [orgStack, setOrgStack] = useState<OrgListItemType[]>([]);

  const { userInfo } = useUserStore();

  const path = useMemo(
    () => (orgStack.length ? getOrgChildrenPath(orgStack[orgStack.length - 1]) : ''),
    [orgStack]
  );

  const currentOrg = useMemo(() => {
    return (
      orgStack.at(-1) ??
      ({
        _id: '',
        path: '',
        pathId: '',
        avatar: userInfo?.team.avatar,
        name: userInfo?.team.teamName
      } as OrgListItemType) // root org
    );
  }, [orgStack, userInfo?.team.avatar, userInfo?.team.teamName]);

  const {
    data: orgs = [],
    loading: isLoadingOrgs,
    refresh: refetchOrgs
  } = useRequest2(() => getOrgList({ orgPath: path, getPermission }), {
    manual: false,
    refreshDeps: [userInfo?.team?.teamId, path]
  });

  const paths = useMemo(() => {
    if (!currentOrg) return [];
    return orgStack
      .map((org) => {
        return {
          parentId: getOrgChildrenPath(org),
          parentName: org.name
        };
      })
      .filter(Boolean) as ParentTreePathItemType[];
  }, [currentOrg, orgStack]);

  const onClickOrg = (org: OrgListItemType) => {
    setOrgStack([...orgStack, org]);
  };

  const {
    data: members = [],
    ScrollData: MemberScrollData,
    refreshList: refetchMembers
  } = useScrollPagination(getOrgMembers, {
    pageSize: 20,
    params: {
      orgPath: path
    },
    refreshDeps: [path]
  });

  const onPathClick = (path: string) => {
    const pathIds = path.split('/');
    setOrgStack(orgStack.filter((org) => pathIds.includes(org.pathId)));
  };

  const refresh = () => {
    refetchOrgs();
    refetchMembers();
  };

  const updateCurrentOrg = (data: { name?: string; description?: string; avatar?: string }) => {
    if (currentOrg.path === '') return;
    setOrgStack([
      ...orgStack.slice(0, -1),
      {
        ...currentOrg,
        name: data.name || currentOrg.name,
        description: data.description || currentOrg.description,
        avatar: data.avatar || currentOrg.avatar
      }
    ]);
  };

  return {
    orgStack,
    currentOrg,
    orgs,
    isLoadingOrgs,
    paths,
    onClickOrg,
    members,
    MemberScrollData,
    onPathClick,
    refresh,
    updateCurrentOrg
  };
}

export default useOrg;
