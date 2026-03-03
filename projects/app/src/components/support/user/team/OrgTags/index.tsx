import { Box, Flex, VStack } from '@chakra-ui/react';
import MyPopover from '@fastgpt/web/components/common/MyPopover';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import Tag from '@fastgpt/web/components/common/Tag';
import React from 'react';

function OrgTags({ orgs, type = 'simple' }: { orgs?: string[]; type?: 'simple' | 'tag' }) {
  return orgs?.length ? (
    <MyTooltip
      label={
        <VStack gap="1" alignItems={'start'}>
          {orgs.map((org, index) => (
            <Box
              key={index}
              fontSize="sm"
              fontWeight={400}
              color="myGray.500"
              maxW={'300px'}
              className="textEllipsis"
            >
              {org.slice(1)}
            </Box>
          ))}
        </VStack>
      }
    >
      {type === 'simple' ? (
        <Box
          noOfLines={1}
          fontSize="xs"
          fontWeight={400}
          maxW={'200px'}
          color="myGray.400"
          whiteSpace={'nowrap'}
        >
          {orgs
            .map((org) => org.split('/').pop())
            .join(', ')
            .slice(0, 30)}
        </Box>
      ) : (
        <Flex direction="row" gap="1" p="2" alignItems={'start'} wrap={'wrap'}>
          {orgs.map((org, index) => (
            <Tag key={index}>{org.split('/').pop()}</Tag>
          ))}
        </Flex>
      )}
    </MyTooltip>
  ) : (
    <Box fontSize="xs" fontWeight={400} w="full" color="myGray.400" whiteSpace={'nowrap'}>
      -
    </Box>
  );
}

export default OrgTags;
