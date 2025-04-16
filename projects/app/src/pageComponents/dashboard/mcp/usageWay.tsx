import { McpKeyType } from '@fastgpt/global/support/mcp/type';
import MyModal from '@fastgpt/web/components/common/MyModal';
import React from 'react';
import { useTranslation } from 'next-i18next';
import { Box, Flex, HStack, ModalBody } from '@chakra-ui/react';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import CopyBox from '@fastgpt/web/components/common/String/CopyBox';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';

const UsageWay = ({ mcp, onClose }: { mcp: McpKeyType; onClose: () => void }) => {
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();

  const sseUrl = `${feConfigs?.mcpServerProxyEndpoint}/${mcp.key}/sse`;
  const jsonConfig = `{
  "mcpServers": {
    "${feConfigs?.systemTitle}-mcp-${mcp._id}": {
      "url": "${sseUrl}"
    }
  }
}`;

  return (
    <MyModal isOpen title={t('dashboard_mcp:usage_way')} onClose={onClose}>
      <ModalBody>
        <Box>
          <FormLabel>{t('dashboard_mcp:mcp_endpoints')}</FormLabel>
          <HStack mt={0.5} bg={'myGray.50'} px={2} py={1} borderRadius={'md'} fontSize={'sm'}>
            <Box userSelect={'all'} flex={'1 0 0'} whiteSpace={'pre-wrap'} wordBreak={'break-all'}>
              {sseUrl}
            </Box>
            <CopyBox value={sseUrl}>
              <MyIconButton icon="copy" />
            </CopyBox>
          </HStack>
        </Box>
        <Box mt={4}>
          <Box borderRadius={'md'} bg={'myGray.100'} overflow={'hidden'} fontSize={'sm'}>
            <Flex
              p={3}
              bg={'myWhite.500'}
              border={'base'}
              borderTopLeftRadius={'md'}
              borderTopRightRadius={'md'}
            >
              <Box flex={1}>{t('dashboard_mcp:mcp_json_config')}</Box>
              <CopyBox value={jsonConfig}>
                <MyIconButton icon="copy" />
              </CopyBox>
            </Flex>
            <Box whiteSpace={'pre-wrap'} wordBreak={'break-all'} p={3} overflowX={'auto'}>
              {jsonConfig}
            </Box>
          </Box>
        </Box>
      </ModalBody>
    </MyModal>
  );
};

export default React.memo(UsageWay);
