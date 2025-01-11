import { Box, HStack, VStack } from '@chakra-ui/react';
import type { OrgType } from '@fastgpt/global/support/user/team/org/type';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { useToggle } from 'ahooks';
import { useMemo } from 'react';
import IconButton from './IconButton';
import { getOrgChildrenPath } from '@fastgpt/global/support/user/team/org/constant';

function OrgTreeNode({
  org,
  list,
  selectedOrg,
  setSelectedOrg,
  index = 0
}: {
  org: OrgType;
  list: OrgType[];
  selectedOrg?: OrgType;
  setSelectedOrg: (org?: OrgType) => void;
  index?: number;
}) {
  const children = useMemo(
    () => list.filter((item) => item.path === getOrgChildrenPath(org)),
    [org, list]
  );
  const [isExpanded, toggleIsExpanded] = useToggle(index === 0);

  return (
    <Box userSelect={'none'}>
      <HStack
        borderRadius="sm"
        _hover={{ bg: 'myGray.100' }}
        py={1}
        pr={2}
        pl={index === 0 ? '0.5rem' : `${1.75 * (index - 1) + 0.5}rem`}
        cursor={'pointer'}
        {...(selectedOrg === org
          ? {
              bg: 'primary.50 !important',
              onClick: () => setSelectedOrg(undefined)
            }
          : {
              onClick: () => setSelectedOrg(org)
            })}
      >
        {index > 0 && (
          <IconButton
            name={isExpanded ? 'common/downArrowFill' : 'common/rightArrowFill'}
            color={'myGray.500'}
            p={0}
            w={'1.25rem'}
            visibility={children.length > 0 ? 'visible' : 'hidden'}
            onClick={(e) => {
              e.stopPropagation();
              toggleIsExpanded.toggle();
            }}
          />
        )}
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
        children.length > 0 &&
        children.map((child) => (
          <Box key={child._id} mt={0.5}>
            <OrgTreeNode
              org={child}
              index={index + 1}
              list={list}
              selectedOrg={selectedOrg}
              setSelectedOrg={setSelectedOrg}
            />
          </Box>
        ))}
    </Box>
  );
}

function OrgTree({
  orgs,
  selectedOrg,
  setSelectedOrg
}: {
  orgs: OrgType[];
  selectedOrg?: OrgType;
  setSelectedOrg: (org?: OrgType) => void;
}) {
  const root = orgs[0];
  if (!root) return;

  return (
    <OrgTreeNode org={root} list={orgs} setSelectedOrg={setSelectedOrg} selectedOrg={selectedOrg} />
  );
}

export default OrgTree;
