import { Box, HStack, VStack } from '@chakra-ui/react';
import type { OrgListItemType, OrgType } from '@fastgpt/global/support/user/team/org/type';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { useToggle } from 'ahooks';
import { useState } from 'react';
import IconButton from './IconButton';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { getOrgList } from '@/web/support/user/team/org/api';
import { getChildrenByOrg } from '@fastgpt/service/support/permission/org/controllers';
import { getOrgChildrenPath } from '@fastgpt/global/support/user/team/org/constant';

function OrgTreeNode({
  org,
  selectedOrg,
  setSelectedOrg,
  index = 0,
  movingOrg
}: {
  org: OrgListItemType;
  selectedOrg?: OrgListItemType;
  setSelectedOrg: (org?: OrgListItemType) => void;
  index?: number;
  movingOrg: OrgListItemType;
}) {
  const [isExpanded, toggleIsExpanded] = useToggle(index === 0);
  const [canBeExpanded, setCanBeExpanded] = useState(true);
  const { data: orgs = [], runAsync: getOrgs } = useRequest2(() =>
    getOrgList({ orgId: org._id, withPermission: false })
  );
  const onClickExpand = async () => {
    const data = await getOrgs();
    if (data.length < 1) {
      setCanBeExpanded(false);
    }
    toggleIsExpanded.toggle();
  };

  if (org._id === movingOrg._id) {
    return <></>;
  }
  return (
    <Box userSelect={'none'}>
      <HStack
        borderRadius="sm"
        _hover={{ bg: 'myGray.100' }}
        py={1}
        pr={2}
        pl={index === 0 ? '0.5rem' : `${1.75 * (index - 1) + 0.5}rem`}
        cursor={'pointer'}
        {...(selectedOrg?._id === org._id
          ? {
              bg: 'primary.50 !important',
              onClick: () => setSelectedOrg(undefined)
            }
          : {
              onClick: () => setSelectedOrg(org)
            })}
      >
        <IconButton
          name={isExpanded ? 'common/downArrowFill' : 'common/rightArrowFill'}
          color={'myGray.500'}
          p={0}
          w={'1.25rem'}
          visibility={canBeExpanded ? 'visible' : 'hidden'}
          onClick={(e) => {
            onClickExpand();
            e.stopPropagation();
          }}
        />
        <HStack
          flex={'1 0 0'}
          onClick={() => setSelectedOrg(org)}
          cursor={'pointer'}
          borderRadius={'xs'}
        >
          <Avatar src={org.avatar} w={'1.25rem'} borderRadius={'xs'} />
          <Box>{org.name}</Box>
        </HStack>
      </HStack>
      {isExpanded &&
        orgs.length > 0 &&
        orgs.map((child) => (
          <Box key={child._id} mt={0.5}>
            <OrgTreeNode
              movingOrg={movingOrg}
              org={child}
              index={index + 1}
              selectedOrg={selectedOrg}
              setSelectedOrg={setSelectedOrg}
            />
          </Box>
        ))}
    </Box>
  );
}

function OrgTree({
  selectedOrg,
  setSelectedOrg,
  movingOrg
}: {
  selectedOrg?: OrgListItemType;
  setSelectedOrg: (org?: OrgListItemType) => void;
  movingOrg: OrgListItemType;
}) {
  const { userInfo } = useUserStore();
  const root: OrgListItemType = {
    _id: '',
    path: '',
    pathId: '',
    name: userInfo?.team.teamName || '',
    avatar: userInfo?.team.avatar || ''
  } as any;

  return (
    <OrgTreeNode
      movingOrg={movingOrg}
      key={'root'}
      org={root}
      selectedOrg={selectedOrg}
      setSelectedOrg={setSelectedOrg}
      index={1}
    />
  );
}

export default OrgTree;
