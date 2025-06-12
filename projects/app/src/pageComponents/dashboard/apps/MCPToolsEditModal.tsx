import { useSelectFile } from '@/web/common/file/hooks/useSelectFile';
import { getMCPTools, postCreateMCPTools } from '@/web/core/app/api/plugin';
import {
  Box,
  Button,
  Center,
  Flex,
  Input,
  ModalBody,
  ModalFooter,
  Table,
  TableContainer,
  Tbody,
  Td,
  Th,
  Thead,
  Tr
} from '@chakra-ui/react';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyModal from '@fastgpt/web/components/common/MyModal';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { AppListContext } from './context';
import { useContextSelector } from 'use-context-selector';
import { type McpToolConfigType } from '@fastgpt/global/core/app/type';
import type { getMCPToolsBody } from '@/pages/api/support/mcp/client/getTools';
import HeaderAuthConfig from '@/components/common/secret/HeaderAuthConfig';
import { type StoreSecretValueType } from '@fastgpt/global/common/secret/type';

export type MCPToolSetData = {
  url: string;
  toolList: McpToolConfigType[];
  headerSecret: StoreSecretValueType;
};

export type EditMCPToolsProps = {
  avatar: string;
  name: string;
  mcpData: MCPToolSetData;
};

const MCPToolsEditModal = ({ onClose }: { onClose: () => void }) => {
  const { t } = useTranslation();

  const { parentId, loadMyApps } = useContextSelector(AppListContext, (v) => v);

  const { register, setValue, handleSubmit, watch } = useForm<EditMCPToolsProps>({
    defaultValues: {
      avatar: 'core/app/type/mcpToolsFill',
      name: '',
      mcpData: {
        url: '',
        headerSecret: {},
        toolList: []
      }
    }
  });
  const avatar = watch('avatar');
  const mcpData = watch('mcpData');

  const { runAsync: onCreate, loading: isCreating } = useRequest2(
    async (data: EditMCPToolsProps) => {
      return postCreateMCPTools({
        name: data.name,
        avatar: data.avatar,
        toolList: data.mcpData.toolList,
        url: data.mcpData.url,
        headerSecret: data.mcpData.headerSecret,
        parentId
      });
    },
    {
      onSuccess() {
        onClose();
        loadMyApps();
      },
      successToast: t('common:create_success'),
      errorToast: t('common:create_failed')
    }
  );

  const { runAsync: runGetMCPTools, loading: isGettingTools } = useRequest2(
    (data: getMCPToolsBody) => getMCPTools(data),
    {
      onSuccess: (res: McpToolConfigType[]) => {
        setValue('mcpData.toolList', res);
      },
      errorToast: t('app:MCP_tools_parse_failed')
    }
  );

  const {
    File,
    onOpen: onOpenSelectFile,
    onSelectImage
  } = useSelectFile({
    fileType: 'image/*',
    multiple: false
  });

  return (
    <>
      <MyModal
        isOpen={true}
        onClose={onClose}
        iconSrc="core/app/type/mcpToolsFill"
        title={t('app:type.MCP tools')}
        w={['90vw', '530px']}
        position={'relative'}
      >
        <ModalBody>
          <Box color={'myGray.900'} fontSize={'14px'} fontWeight={'medium'}>
            {t('common:input_name')}
          </Box>
          <Flex mt={2} alignItems={'center'}>
            <MyTooltip label={t('common:set_avatar')}>
              <Avatar
                flexShrink={0}
                src={avatar}
                w={['28px', '32px']}
                h={['28px', '32px']}
                cursor={'pointer'}
                borderRadius={'md'}
                onClick={onOpenSelectFile}
              />
            </MyTooltip>
            <Input
              flex={1}
              ml={4}
              bg={'myWhite.600'}
              {...register('name', {
                required: t('common:name_is_empty')
              })}
            />
          </Flex>

          <Flex
            color={'myGray.900'}
            fontSize={'14px'}
            fontWeight={'medium'}
            mt={6}
            alignItems={'center'}
          >
            <Box>{t('app:MCP_tools_url')}</Box>
            <Box flex={1} />
            <HeaderAuthConfig
              storeHeaderSecretConfig={mcpData.headerSecret}
              onUpdate={(data) => {
                setValue('mcpData.headerSecret', data);
              }}
              buttonProps={{
                size: 'sm',
                variant: 'grayGhost'
              }}
            />
          </Flex>
          <Flex alignItems={'center'} gap={2} mt={2}>
            <Input
              h={8}
              placeholder={t('app:MCP_tools_url_placeholder')}
              {...register('mcpData.url', {
                required: t('app:MCP_tools_url_is_empty')
              })}
            />
            <Button
              size={'sm'}
              variant={'whitePrimary'}
              h={8}
              isLoading={isGettingTools}
              onClick={() => {
                runGetMCPTools({
                  url: mcpData.url,
                  headerSecret: mcpData.headerSecret
                });
              }}
            >
              {t('common:Parse')}
            </Button>
          </Flex>

          <Box color={'myGray.900'} fontSize={'14px'} fontWeight={'medium'} mt={6}>
            {t('app:MCP_tools_list')}
          </Box>
          <Box
            mt={2}
            borderRadius={'md'}
            overflow={'hidden'}
            borderWidth={'1px'}
            position={'relative'}
          >
            <TableContainer maxH={360} minH={200} overflowY={'auto'}>
              <Table bg={'white'}>
                <Thead bg={'myGray.50'}>
                  <Th fontSize={'mini'} py={0} h={'34px'}>
                    {t('common:Name')}
                  </Th>
                  <Th fontSize={'mini'} py={0} h={'34px'}>
                    {t('common:plugin.Description')}
                  </Th>
                </Thead>
                <Tbody>
                  {mcpData.toolList.map((item) => (
                    <Tr key={item.name} height={'28px'}>
                      <Td
                        fontSize={'mini'}
                        color={'myGray.900'}
                        fontWeight={'medium'}
                        py={2}
                        maxW={1 / 2}
                        overflow={'hidden'}
                        textOverflow={'ellipsis'}
                        whiteSpace={'nowrap'}
                      >
                        {item.name}
                      </Td>
                      <Td
                        fontSize={'mini'}
                        color={'myGray.900'}
                        fontWeight={'medium'}
                        py={2}
                        maxW={1 / 2}
                        overflow={'hidden'}
                        textOverflow={'ellipsis'}
                        whiteSpace={'nowrap'}
                      >
                        {item.description}
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </TableContainer>
            {mcpData.toolList.length === 0 && (
              <Center
                position={'absolute'}
                top={0}
                left={0}
                right={0}
                bottom={0}
                fontSize={'mini'}
                color={'myGray.500'}
              >
                {t('app:no_mcp_tools_list')}
              </Center>
            )}
          </Box>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button variant={'whitePrimary'} onClick={onClose}>
            {t('common:Close')}
          </Button>
          <Button
            isDisabled={mcpData.toolList.length === 0}
            isLoading={isCreating}
            onClick={handleSubmit(onCreate)}
          >
            {t('common:comfirn_create')}
          </Button>
        </ModalFooter>
      </MyModal>
      <File
        onSelect={(e) =>
          onSelectImage(e, {
            maxH: 300,
            maxW: 300,
            callback: (e) => setValue('avatar', e)
          })
        }
      />
    </>
  );
};

export default MCPToolsEditModal;
