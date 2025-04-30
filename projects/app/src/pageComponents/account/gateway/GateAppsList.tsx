import React from 'react';
import { Box, Flex, Text, Avatar, Heading, Button } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { AppListItemType } from '@fastgpt/global/core/app/type';
import { useRouter } from 'next/router';

type Props = {
  gateApps: AppListItemType[];
};

const GateAppsList = ({ gateApps }: Props) => {
  const { t } = useTranslation();
  const router = useRouter();

  const handleGateClick = (appId: string) => {
    router.push(`/app/detail?appId=${appId}`);
  };

  return (
    <Box w="220px" h="100%" bg="#FBFBFC" borderRight="1px solid #E8EBF0" p={5} overflowY="auto">
      <Flex justifyContent="space-between" alignItems="center" mb={4}>
        <Heading size="sm">{t('account_gate:gate_list')}</Heading>
      </Flex>

      {gateApps.length === 0 ? (
        <Flex direction="column" justify="center" align="center" h="180px" gap={4}>
          <Text color="gray.500" fontSize="sm" textAlign="center">
            {t('account_gate:no_gate_available')}
          </Text>
        </Flex>
      ) : (
        <Flex direction="column" gap={3}>
          {gateApps.map((gate) => (
            <Flex
              key={gate._id}
              align="center"
              p={3}
              borderRadius="md"
              cursor="pointer"
              transition="all 0.2s ease"
              bg="white"
              border="1px solid"
              borderColor="gray.100"
              boxShadow="0 2px 8px rgba(0,0,0,0.06)"
              _hover={{
                transform: 'translateY(-2px)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                borderColor: 'primary.300'
              }}
              onClick={() => handleGateClick(gate._id)}
            >
              <Avatar src={gate.avatar} size="sm" mr={3} borderRadius="md" />
              <Box>
                <Text fontSize="sm" fontWeight="medium" className="textEllipsis">
                  {gate.name}
                </Text>
                {gate.intro && (
                  <Text fontSize="xs" color="gray.500" className="textEllipsis">
                    {gate.intro}
                  </Text>
                )}
              </Box>
            </Flex>
          ))}
        </Flex>
      )}
    </Box>
  );
};

export default GateAppsList;
