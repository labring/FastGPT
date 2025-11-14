import { type McpKeyType } from '@fastgpt/global/support/mcp/type';
import MyModal from '@fastgpt/web/components/common/MyModal';
import React, { useState } from 'react';
import { useTranslation } from 'next-i18next';
import { Box, Flex, HStack, ModalBody } from '@chakra-ui/react';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import CopyBox from '@fastgpt/web/components/common/String/CopyBox';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import LightRowTabs from '@fastgpt/web/components/common/Tabs/LightRowTabs';

type LinkWay = 'sse' | 'http';

const UsageWay = ({ mcp, onClose }: { mcp: McpKeyType; onClose: () => void }) => {
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();
  const [linkWay, setLinkWay] = useState<LinkWay>('http');

  const { url, jsonConfig } = (() => {
    if (linkWay === 'http') {
      const baseUrl = feConfigs?.customApiDomain || `${location.origin}/api`;
      const url = `${baseUrl}/mcp/app/${mcp.key}/mcp`;
      const jsonConfig = `{
  "mcpServers": {
    "${feConfigs?.systemTitle}-mcp-${mcp._id}": {
      "url": "${url}"
    }
  }
}`;
      return {
        url,
        jsonConfig
      };
    }

    const url = feConfigs?.mcpServerProxyEndpoint
      ? `${feConfigs?.mcpServerProxyEndpoint}/${mcp.key}/sse`
      : '';
    const jsonConfig = `{
  "mcpServers": {
    "${feConfigs?.systemTitle}-mcp-${mcp._id}": {
      "url": "${url}"
    }
  }
}`;

    return {
      url,
      jsonConfig
    };
  })();

  return (
    <MyModal iconSrc="key" isOpen title={t('dashboard_mcp:usage_way')} onClose={onClose}>
      <ModalBody>
        <Flex>
          <LightRowTabs<LinkWay>
            m={'auto'}
            w={'100%'}
            list={[
              { label: 'Streamable HTTP', value: 'http' },
              { label: 'SSE', value: 'sse' }
            ]}
            value={linkWay}
            onChange={setLinkWay}
          />
        </Flex>
        {url ? (
          <>
            <Box mt={4}>
              <FormLabel>{t('dashboard_mcp:mcp_endpoints')}</FormLabel>
              <HStack mt={0.5} bg={'myGray.50'} px={2} py={1} borderRadius={'md'} fontSize={'sm'}>
                <Box
                  userSelect={'all'}
                  flex={'1 0 0'}
                  whiteSpace={'pre-wrap'}
                  wordBreak={'break-all'}
                >
                  {url}
                </Box>
                <CopyBox value={url}>
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
          </>
        ) : (
          <Flex h={'200px'} justifyContent={'center'} alignItems={'center'}>
            {t('dashboard_mcp:not_sse_server')}
          </Flex>
        )}
      </ModalBody>
    </MyModal>
  );
};

export default React.memo(UsageWay);
