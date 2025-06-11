import { Box, Button, Flex, Input, ModalBody, ModalFooter } from '@chakra-ui/react';
import React, { useState } from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import { useTranslation } from 'react-i18next';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { AppContext } from '../context';
import { useContextSelector } from 'use-context-selector';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import { type McpToolConfigType } from '@fastgpt/global/core/app/type';
import MyModal from '@fastgpt/web/components/common/MyModal';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyBox from '@fastgpt/web/components/common/MyBox';
import type { getMCPToolsBody } from '@/pages/api/support/mcp/client/getTools';
import { getMCPTools } from '@/web/core/app/api/plugin';
import HeaderAuthConfig from '@/components/common/secret/HeaderAuthConfig';
import { type StoreSecretValueType } from '@fastgpt/global/common/secret/type';

const EditForm = ({
  url,
  setUrl,
  toolList,
  setToolList,
  currentTool,
  setCurrentTool,
  headerSecret,
  setHeaderSecret
}: {
  url: string;
  setUrl: (url: string) => void;
  toolList: McpToolConfigType[];
  setToolList: (toolList: McpToolConfigType[]) => void;
  currentTool?: McpToolConfigType;
  setCurrentTool: (tool: McpToolConfigType) => void;
  headerSecret: StoreSecretValueType;
  setHeaderSecret: (headerSecret: StoreSecretValueType) => void;
}) => {
  const { t } = useTranslation();

  const [toolDetail, setToolDetail] = useState<McpToolConfigType | null>(null);

  const { runAsync: runGetMCPTools, loading: isGettingTools } = useRequest2(
    async (data: getMCPToolsBody) => await getMCPTools(data),
    {
      onSuccess: (res) => {
        setToolList(res);
        setCurrentTool(res[0]);
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
            onChange={(e) => setUrl(e.target.value)}
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
                      setToolDetail(tool);
                    }}
                  />
                </Flex>
              </MyBox>
            );
          })}
        </Box>
      </Box>

      {toolDetail && <ToolDetailModal tool={toolDetail} onClose={() => setToolDetail(null)} />}
    </>
  );
};

export default React.memo(EditForm);

const ToolDetailModal = ({ tool, onClose }: { tool: McpToolConfigType; onClose: () => void }) => {
  const { t } = useTranslation();
  const appDetail = useContextSelector(AppContext, (v) => v.appDetail);

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
        <Flex pb={6} borderBottom={'1px solid'} borderColor={'myGray.200'}>
          <Avatar src={appDetail.avatar} borderRadius={'md'} w={'40px'} />
          <Box ml={'14px'}>
            <Box fontSize={'16px'} color={'myGray.900'}>
              {tool.name}
            </Box>
            <Box fontSize={'12px'} color={'myGray.500'}>
              {tool.description}
            </Box>
          </Box>
        </Flex>

        <Box mt={6} color={'myGray.900'} fontWeight={'medium'}>
          {t('common:Params')}
        </Box>

        <Box mt={3}>
          {Object.entries(tool.inputSchema.properties || {}).map(
            ([paramName, paramInfo]: [string, any]) => (
              <Box key={paramName} py={2} borderBottom={'1px solid'} borderColor={'myGray.150'}>
                <Flex alignItems="center">
                  {tool.inputSchema.required?.includes(paramName) && (
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
                    {paramInfo.type}
                  </Box>
                </Flex>

                <Box mt={1} fontSize="13px" color="myGray.600">
                  {paramInfo.description}
                </Box>
              </Box>
            )
          )}
        </Box>
      </ModalBody>
      <ModalFooter>
        <Button size={'md'} onClick={onClose}>
          {t('common:Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};
