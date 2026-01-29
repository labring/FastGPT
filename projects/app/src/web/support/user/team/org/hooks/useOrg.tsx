import { getOrgChildrenPath } from '@fastgpt/global/support/user/team/org/constant';
import { type OrgListItemType } from '@fastgpt/global/support/user/team/org/type';
import { memo, useEffect, useMemo, useState } from 'react';
import { useUserStore } from '../../../useUserStore';
import { type ParentTreePathItemType } from '@fastgpt/global/common/parentFolder/type';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { getOrgList, getOrgMembers } from '../api';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import { getTeamMembers } from '../../api';
import _ from 'lodash';
import { useDebounce } from 'ahooks';

function useOrg({ withPermission = true }: { withPermission?: boolean } = {}) {
  const [orgStack, setOrgStack] = useState<OrgListItemType[]>([]);
  const [searchKey, setSearchKey] = useState('');
  // 使用防抖确保搜索使用最新的关键词，避免中文输入法导致的状态不一致
  const debouncedSearchKey = useDebounce(searchKey, { wait: 300 });

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
  } = useRequest(
    () =>
      getOrgList({
        orgId: currentOrg._id,
        withPermission: withPermission,
        searchKey: debouncedSearchKey
      }),
    {
      manual: false,
      refreshDeps: [userInfo?.team?.teamId, path, currentOrg._id, debouncedSearchKey]
    }
  );

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
    if (searchKey) {
      setOrgStack([org]);
      setSearchKey('');
    } else {
      setOrgStack([...orgStack, org]);
    }
  };

  const {
    data: members = [],
    ScrollData: MemberScrollData,
    refreshList: refetchMembers,
    isLoading: isLoadingMembers
  } = useScrollPagination(getTeamMembers, {
    pageSize: 20,
    params: {
      orgId: currentOrg._id,
      withOrgs: false,
      withPermission: true,
      status: 'active'
    },
    refreshDeps: [path]
  });

  const onPathClick = (path: string) => {
    const pathIds = path.split('/');
    setOrgStack(orgStack.filter((org) => pathIds.includes(org.pathId)));
    setSearchKey('');
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

  const isLoading = isLoadingOrgs || isLoadingMembers;

  return {
    orgStack,
    currentOrg,
    orgs,
    isLoading,
    paths,
    onClickOrg,
    members,
    MemberScrollData,
    onPathClick,
    refresh,
    updateCurrentOrg,
    searchKey,
    setSearchKey,
    debouncedSearchKey
  };
}

export default useOrg;
