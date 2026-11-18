import {
  Box,
  Button,
  Flex,
  Input,
  ModalBody,
  ModalFooter,
  FormControl,
  FormErrorMessage,
  Textarea
} from '@chakra-ui/react';
import React, { useRef, useState } from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import { useTranslation } from 'next-i18next';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { AppContext } from '../../context';
import { useContextSelector } from 'use-context-selector';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import {
  McpToolConfigSchema,
  type McpToolConfigType
} from '@fastgpt/global/core/app/tool/mcpTool/type';
import MyModal from '@fastgpt/web/components/common/MyModal';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyBox from '@fastgpt/web/components/common/MyBox';
import type { GetMcpToolsBodyType } from '@fastgpt/global/openapi/core/app/mcpTools/api';
import { getMCPTools } from '@/web/core/app/api/mcpTools';
import HeaderAuthConfig from '@/components/common/secret/HeaderAuthConfig';
import { type StoreSecretValueType } from '@fastgpt/global/common/secret/type';
import type { JsonSchemaPropertiesItemType } from '@fastgpt/global/core/app/jsonschema';

const EditForm = ({
  url,
  setUrl,
  toolSourceUrl,
  setToolSourceUrl,
  toolList,
  setToolList,
  currentTool,
  setCurrentTool,
  headerSecret,
  setHeaderSecret
}: {
  url: string;
  setUrl: (url: string) => void;
  toolSourceUrl: string;
  setToolSourceUrl: (url: string) => void;
  toolList: McpToolConfigType[];
  setToolList: (toolList: McpToolConfigType[]) => void;
  currentTool?: McpToolConfigType;
  setCurrentTool: (tool: McpToolConfigType) => void;
  headerSecret: StoreSecretValueType;
  setHeaderSecret: (headerSecret: StoreSecretValueType) => void;
}) => {
  const { t } = useTranslation();

  const [toolDetail, setToolDetail] = useState<{
    tool: McpToolConfigType;
    sourceUrl: string;
    revision: number;
  } | null>(null);
  const parseRevision = useRef(0);

  const { runAsync: runGetMCPTools, loading: isGettingTools } = useRequest(
    async (data: GetMcpToolsBodyType) => await getMCPTools(data),
    {
      onSuccess: (res, [data]) => {
        if (data.url !== url) return;
        // 解析结果到达后，旧弹窗的定义和编辑来源均已过期。
        parseRevision.current += 1;
        setToolDetail(null);
        // 只在重新解析同一服务时按名称保留配置，避免把元数据带到另一个服务。
        const preserveMetadata = toolSourceUrl === data.url;
        const tools = res.map((tool) => {
          const requestMeta = preserveMetadata
            ? toolList.find((item) => item.name === tool.name)?.requestMeta
            : undefined;
          return requestMeta !== undefined ? { ...tool, requestMeta } : tool;
        });
        setToolList(tools);
        setCurrentTool(tools.find((tool) => tool.name === currentTool?.name) ?? tools[0]);
        setToolSourceUrl(data.url);
      },
      errorToast: t('app:MCP_tools_parse_failed')
    }
  );

  return (
    <>
      <Box p={6}>
        <Flex alignItems={'center'}>
          <MyIcon name={'common/linkBlue'} w={'20px'} />
          <FormLabel ml={2} flex={1}>
            {t('app:MCP_tools_url')}
          </FormLabel>
          <HeaderAuthConfig
            storeHeaderSecretConfig={headerSecret}
            onUpdate={setHeaderSecret}
            buttonProps={{
              size: 'sm',
              variant: 'grayGhost'
            }}
          />
        </Flex>
        <Flex alignItems={'center'} gap={2} mt={3}>
          <Input
            h={8}
            placeholder={t('app:MCP_tools_url_placeholder')}
            value={url}
            onChange={(e) => {
              setToolDetail(null);
              setUrl(e.target.value);
            }}
          />
          <Button
            size={'sm'}
            variant={'whitePrimary'}
            h={8}
            isLoading={isGettingTools}
            onClick={() => {
              runGetMCPTools({ url, headerSecret });
            }}
          >
            {t('common:Parse')}
          </Button>
        </Flex>

        {toolSourceUrl !== url && (
          <Box mt={2} fontSize="12px" color="myGray.600">
            {t('app:MCP_tools_parse_required')}
          </Box>
        )}

        <Flex alignItems={'center'} mt={6}>
          <MyIcon name={'common/list'} w={'20px'} color={'primary.600'} />
          <FormLabel ml={2} flex={1}>
            {t('app:MCP_tools_list_with_number', {
              total: toolList.length || 0
            })}
          </FormLabel>
        </Flex>

        <Box mt={3}>
          {toolList.map((tool, index) => {
            return (
              <MyBox
                key={tool.name}
                role="group"
                position="relative"
                border={'1px solid'}
                {...(currentTool?.name === tool.name
                  ? {
                      borderRadius: '8px',
                      borderColor: 'primary.600',
                      borderBottomColor: 'primary.600',
                      boxShadow:
                        '0px 4px 4px 0px rgba(19, 51, 107, 0.05), 0px 0px 1px 0px rgba(19, 51, 107, 0.08)'
                    }
                  : {
                      borderRadius: 'none',
                      borderColor: 'transparent',
                      borderBottomColor: 'myGray.150',
                      boxShadow: 'none'
                    })}
                _hover={{
                  borderRadius: '8px',
                  boxShadow:
                    '0px 4px 4px 0px rgba(19, 51, 107, 0.05), 0px 0px 1px 0px rgba(19, 51, 107, 0.08)'
                }}
                cursor={'pointer'}
                onClick={() => {
                  setCurrentTool(tool);
                }}
              >
                <Flex alignItems={'center'} py={2} px={3}>
                  <Box w={'20px'} fontSize={'14px'} color={'myGray.500'} fontWeight={'medium'}>
                    {index + 1 < 10 ? `0${index + 1}` : index + 1}
                  </Box>
                  <Box maxW={'full'} pl={2} position="relative" width="calc(100% - 30px)">
                    <Box
                      fontSize={'14px'}
                      color={'myGray.900'}
                      whiteSpace="nowrap"
                      overflow="hidden"
                      textOverflow="ellipsis"
                    >
                      {tool.name}
                    </Box>
                    <Box
                      fontSize={'12px'}
                      color={'myGray.500'}
                      whiteSpace="nowrap"
                      overflow="hidden"
                      textOverflow="ellipsis"
                    >
                      {tool.description || t('app:tools_no_description')}
                    </Box>
                  </Box>
                  <Box flex={1} />
                </Flex>

                <Flex
                  position="absolute"
                  right={3}
                  top="50%"
                  transform="translateY(-50%)"
                  gap={2}
                  display="none"
                  _groupHover={{ display: 'flex' }}
                  background="linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,1) 15%, rgba(255,255,255,1) 100%)"
                  paddingLeft="20px"
                >
                  <MyIconButton
                    size={'16px'}
                    icon={'common/detail'}
                    p={2}
                    border={'1px solid'}
                    borderColor={'myGray.250'}
                    hoverBg={'rgba(51, 112, 255, 0.10)'}
                    hoverBorderColor={'primary.300'}
                    tip={t('app:MCP_tools_detail')}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (toolSourceUrl !== url) return;
                      setToolDetail({ tool, sourceUrl: url, revision: parseRevision.current });
                    }}
                  />
                </Flex>
              </MyBox>
            );
          })}
        </Box>
      </Box>

      {toolDetail && toolDetail.sourceUrl === url && (
        <ToolDetailModal
          tool={toolDetail.tool}
          onClose={() => setToolDetail(null)}
          onUpdate={(requestMeta) => {
            if (toolDetail.sourceUrl !== url || toolDetail.revision !== parseRevision.current)
              return;
            const latestTool = toolList.find((tool) => tool.name === toolDetail.tool.name);
            if (!latestTool) return;
            // 只更新用户编辑的元数据，定义始终取当前列表，不能回写弹窗的旧快照。
            const updatedTool = { ...latestTool, requestMeta };
            setToolList(
              toolList.map((tool) => (tool.name === updatedTool.name ? updatedTool : tool))
            );
            if (currentTool?.name === updatedTool.name) setCurrentTool(updatedTool);
          }}
        />
      )}
    </>
  );
};

export default React.memo(EditForm);

const ToolDetailModal = ({
  tool,
  onClose,
  onUpdate
}: {
  tool: McpToolConfigType;
  onClose: () => void;
  onUpdate: (requestMeta: McpToolConfigType['requestMeta']) => void;
}) => {
  const { t } = useTranslation();
  const appDetail = useContextSelector(AppContext, (v) => v.appDetail);
  const [metadataText, setMetadataText] = useState(
    tool.requestMeta !== undefined ? JSON.stringify(tool.requestMeta, null, 2) : ''
  );
  const [invalidMetadata, setInvalidMetadata] = useState(false);

  /** 空输入清除配置；只有合法 JSON 对象才能写回工具列表并参与保存和调试。 */
  const confirm = () => {
    try {
      const requestMeta = McpToolConfigSchema.shape.requestMeta.parse(
        metadataText.trim() ? JSON.parse(metadataText) : undefined
      );
      onUpdate(requestMeta);
      onClose();
    } catch {
      setInvalidMetadata(true);
    }
  };

  return (
    <MyModal
      isOpen={true}
      iconSrc="common/detail"
      iconColor={'primary.600'}
      title={t('app:tool_detail')}
      onClose={onClose}
      w={'530px'}
    >
      <ModalBody>
        <Flex
          pb={6}
          borderBottom={'1px solid'}
          borderColor={'myGray.200'}
          alignItems={'flex-start'}
        >
          <Avatar src={appDetail.avatar} borderRadius={'md'} w={'40px'} />
          <Box ml={'14px'}>
            <Box fontSize={'16px'} color={'myGray.900'}>
              {tool.name}
            </Box>
            <Box fontSize={'12px'} color={'myGray.500'} maxH={'100px'} overflow={'auto'}>
              {tool.description}
            </Box>
          </Box>
        </Flex>

        <Box mt={6} color={'myGray.900'} fontWeight={'medium'}>
          {t('app:raw_params')}
        </Box>

        <Box mt={3}>
          {Object.entries(tool.inputSchema?.properties || {}).map(
            ([paramName, paramInfo]: [string, JsonSchemaPropertiesItemType]) => (
              <Box key={paramName} py={2} borderBottom={'1px solid'} borderColor={'myGray.150'}>
                <Flex alignItems="center">
                  {tool.inputSchema?.required?.includes(paramName) && (
                    <Box mr={1} color="red.500">
                      *
                    </Box>
                  )}
                  <Box fontSize="14px" color="myGray.900">
                    {paramName}
                  </Box>

                  <Box
                    ml={1}
                    fontSize={'12px'}
                    color={'myGray.600'}
                    px={1}
                    bg={'myGray.25'}
                    borderRadius={'sm'}
                    border={'1px solid'}
                    borderColor={'myGray.200'}
                  >
                    {paramInfo.type ||
                      paramInfo.anyOf?.map((item) => item.type).join(',') ||
                      paramInfo.oneOf?.map((item) => item.type).join(',') ||
                      paramInfo.allOf?.map((item) => item.type).join(',') ||
                      'any'}
                  </Box>
                </Flex>

                <Box mt={1} fontSize="13px" color="myGray.600">
                  {paramInfo.description}
                </Box>
              </Box>
            )
          )}
        </Box>
        <FormControl mt={6} isInvalid={invalidMetadata}>
          <FormLabel id="mcp-request-meta-label">{t('app:MCP_tools_request_meta')}</FormLabel>
          <Box mt={2} mb={3} fontSize="12px" color="myGray.500">
            {t('app:MCP_tools_request_meta_description')}
          </Box>
          <Textarea
            id="mcp-request-meta"
            aria-labelledby="mcp-request-meta-label"
            value={metadataText}
            onChange={(event) => {
              setMetadataText(event.target.value);
              setInvalidMetadata(false);
            }}
            placeholder={'{ "example/context": { "locale": "zh-CN" } }'}
            fontFamily="mono"
            rows={5}
          />
          <FormErrorMessage>{t('app:MCP_tools_request_meta_invalid')}</FormErrorMessage>
        </FormControl>
      </ModalBody>
      <ModalFooter>
        <Button size={'md'} onClick={confirm}>
          {t('common:Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};
