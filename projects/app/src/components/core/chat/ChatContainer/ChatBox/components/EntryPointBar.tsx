import React from 'react';
import { Flex, Button } from '@chakra-ui/react';
import { type EntryPointItemType } from '@fastgpt/global/core/app/type';
import MyImage from '@/components/MyImage';

type Props = {
  entryPoints: EntryPointItemType[];
  selected: string | null;
  onChange: (name: string | null) => void;
};
const EntryPointBar = ({ entryPoints, selected, onChange }: Props) => {
  if (!entryPoints?.length) return null;

  return (
    <Flex alignItems="center" gap={2} flexWrap="nowrap" overflowX="auto">
      {entryPoints.map((entry) => {
        const isActive = selected === entry.name;
        return (
          <Button
            key={entry.id}
            size="sm"
            variant="outline"
            h="8"
            px={2}
            fontSize="xs"
            fontWeight={400}
            letterSpacing="0.5px"
            flexShrink={0}
            leftIcon={entry.icon ? <MyImage src={entry.icon} w="16px" h={'16px'} /> : undefined}
            color={isActive ? 'primary.700' : 'myGray.700'}
            borderColor={isActive ? 'primary.500' : 'myGray.200'}
            bg="transparent"
            _hover={{
              borderColor: isActive ? 'primary.500' : 'myGray.300',
              bg: isActive ? 'primary.50' : 'myGray.50'
            }}
            onClick={() => onChange(isActive ? null : entry.name)}
          >
            {entry.name}
          </Button>
        );
      })}
    </Flex>
  );
};

export default React.memo(EntryPointBar);
