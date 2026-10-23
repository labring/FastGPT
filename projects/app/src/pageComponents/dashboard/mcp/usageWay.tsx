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

/**
 * 将 MCP 服务名规范化为 ASCII 安全的 key 片段。
 * 只保留小写字母、数字、下划线和连字符，其余字符转为连字符并合并相邻项。
 */
const slugifyMcpName = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

/**
 * 生成 mcpServers 配置中的服务 key。
 * 优先使用用户可编辑的服务名，但必须同时满足三个条件：
 * 1. 名称全为 ASCII 字符 —— 部分 MCP 客户端环境无法解析中文等非 ASCII key；
 * 2. 规范化后非空；
 * 3. 与同团队其它 MCP 服务的规范化名称不冲突 —— 避免两个服务生成相同 key。
 * 任一条件不满足时，回退到旧的自动生成格式（`${systemTitle}-mcp-${_id}`），
 * 该格式以 _id 为后缀，天然唯一且只含 ASCII 字符。
 */
const getMcpConfigKey = (
  mcp: McpKeyType,
  siblingMcps: McpKeyType[],
  systemTitle?: string
): string => {
  const fallbackKey = `${systemTitle}-mcp-${mcp._id}`;
  const name = mcp.name || '';

  // 名称含非 ASCII 字符（如中文）时回退，保证各 MCP 客户端环境都能解析
  if (/[^\x00-\x7F]/.test(name)) return fallbackKey;

  const slug = slugifyMcpName(name);
  if (!slug) return fallbackKey;

  // 与同团队其它 MCP 服务重名（规范化后相同）时回退，保证 key 唯一
  const siblingSlugs = new Set(
    siblingMcps.filter((item) => item._id !== mcp._id).map((item) => slugifyMcpName(item.name || ''))
  );
  if (siblingSlugs.has(slug)) return fallbackKey;

  return slug;
};

const UsageWay = ({
  mcp,
  siblingMcps = [],
  onClose
}: {
  mcp: McpKeyType;
  siblingMcps?: McpKeyType[];
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();
  const [linkWay, setLinkWay] = useState<LinkWay>('http');

  const configKey = getMcpConfigKey(mcp, siblingMcps, feConfigs?.systemTitle);

  const { url, jsonConfig } = (() => {
    if (linkWay === 'http') {
      const baseUrl = feConfigs?.customApiDomain || `${location.origin}/api`;
      const url = `${baseUrl}/mcp/app/${mcp.key}/mcp`;
      // 用 JSON.stringify 组装配置，避免名称中的引号破坏 JSON 结构
      const jsonConfig = JSON.stringify(
        {
          mcpServers: {
            [configKey]: {
              url
            }
          }
        },
        null,
        2
      );
      return {
        url,
        jsonConfig
      };
    }

    const url = feConfigs?.mcpServerProxyEndpoint
      ? `${feConfigs?.mcpServerProxyEndpoint}/${mcp.key}/sse`
      : '';
    const jsonConfig = JSON.stringify(
      {
        mcpServers: {
          [configKey]: {
            url
          }
        }
      },
      null,
      2
    );

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
