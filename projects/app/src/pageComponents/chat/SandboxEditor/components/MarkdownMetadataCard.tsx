import React from 'react';
import { Box } from '@chakra-ui/react';

type Props = {
  metadata: Record<string, string>;
};

const MarkdownMetadataCard = ({ metadata }: Props) => {
  return (
    <Box
      p={4}
      bg="myGray.25"
      borderRadius="6px"
      border="1px solid"
      borderColor="myGray.200"
      borderLeft="4px solid"
      borderLeftColor="primary.600"
      boxShadow="0 1px 3px rgba(0, 0, 0, 0.02)"
      transition="all 0.2s ease"
      _hover={{
        boxShadow: '0 4px 12px rgba(17, 24, 36, 0.05)',
        borderColor: 'myGray.300',
        borderLeftColor: 'primary.700'
      }}
    >
      <Box
        display="grid"
        gridTemplateColumns="110px 1fr"
        gap={3}
        rowGap={4}
        fontSize="xs"
        alignItems="center"
      >
        {Object.entries(metadata).map(([k, v]) => (
          <React.Fragment key={k}>
            <Box
              fontWeight="medium"
              color="myGray.500"
              textTransform="capitalize"
              fontSize="xs"
              alignSelf="start"
              pt="1px"
            >
              {k.replace(/_/g, ' ')}
            </Box>
            <Box color="myGray.800" whiteSpace="pre-wrap" wordBreak="break-word" alignSelf="center">
              {v}
            </Box>
          </React.Fragment>
        ))}
      </Box>
    </Box>
  );
};

export default React.memo(MarkdownMetadataCard);
