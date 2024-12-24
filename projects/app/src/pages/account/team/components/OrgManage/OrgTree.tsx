import { Box, HStack, Text, VStack } from '@chakra-ui/react';
import { DEFAULT_ORG_AVATAR } from '@fastgpt/global/common/system/constants';
import type { OrgType } from '@fastgpt/global/support/user/team/org/type';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { useToggle } from 'ahooks';
import { useMemo, useState } from 'react';
import IconButton from './IconButton';

function OrgTreeNode({
  org,
  list,
  selectedOrg,
  selectOrg,
  indent = 0
}: {
  org: OrgType;
  list: OrgType[];
  selectedOrg?: OrgType;
  selectOrg?: (org: OrgType | undefined) => void;
  indent?: number;
}) {
  const children = useMemo(
    () => list.filter((item) => item.path === `${org.path}/${org._id}`),
    [org, list]
  );
  const [isExpanded, toggleIsExpanded] = useToggle(false);

  return (
    <VStack alignItems={'start'} w="full" gap={'8px'}>
      <HStack
        w="full"
        _hover={{ bgColor: selectedOrg === org ? 'blue.200' : 'gray.100' }}
        borderRadius="4px"
        boxSizing="border-box"
        py="4px"
        pl={`calc(${indent}rem + 4px)`}
        transition={'background 0.1s'}
        {...(selectedOrg === org ? { bgColor: 'blue.100' } : {})}
      >
        {children.length > 0 ? (
          <IconButton
            name={isExpanded ? 'common/downArrowFill' : 'common/rightArrowFill'}
            onClick={() => toggleIsExpanded.toggle()}
          />
        ) : (
          <Box w={'1rem'} h={'1rem'} m="1" />
        )}
        <HStack onClick={() => selectOrg?.(org)} cursor="pointer">
          <Avatar src={org.avatar || DEFAULT_ORG_AVATAR} w="20px" h="20px" rounded={'50%'} />
          <Text>{org.name}</Text>
        </HStack>
      </HStack>
      {isExpanded &&
        children.length > 0 &&
        children.map((child) => (
          <OrgTreeNode
            key={child._id}
            org={child}
            indent={indent + 1}
            list={list}
            selectedOrg={selectedOrg}
            selectOrg={selectOrg}
          />
        ))}
    </VStack>
  );
}

function OrgTree({
  orgs,
  teamName,
  teamAvatar,
  selectedOrg,
  selectOrg
}: {
  orgs: OrgType[];
  teamAvatar: string;
  teamName: string;
  selectedOrg?: OrgType;
  selectOrg?: (org: OrgType | undefined) => void;
}) {
  const root = orgs[0];
  if (!root) return null;
  const children = useMemo(
    () => orgs.filter((item) => item.path === `${root.path}/${root._id}`),
    [root, orgs]
  );
  return (
    <VStack alignItems={'start'} gap={'8px'}>
      <HStack
        w="full"
        onClick={() => selectOrg?.(root)}
        cursor="pointer"
        _hover={{ bgColor: selectedOrg === root ? 'blue.200' : 'gray.100' }}
        borderRadius="4px"
        p="4px"
        transition={'background 0.1s'}
        {...(selectedOrg === root ? { bgColor: 'blue.100' } : {})}
      >
        <Avatar src={teamAvatar} w="20px" h="20px" rounded={'50%'} />
        <Text>{teamName}</Text>
      </HStack>
      {children.map((child) => (
        <OrgTreeNode
          key={child._id}
          org={child}
          list={orgs}
          selectOrg={selectOrg}
          selectedOrg={selectedOrg}
        />
      ))}
    </VStack>
  );
}

export default OrgTree;
