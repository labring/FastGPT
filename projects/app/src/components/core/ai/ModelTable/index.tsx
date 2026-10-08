import { getPublicModelCatalog } from '@/web/core/ai/model/api';
import { useModelList } from '@/web/core/ai/model/useModelList';
import { useUserModelStore } from '@/web/core/ai/model/useUserModelStore';
import { useUserStore } from '@/web/support/user/useUserStore';
import {
  Flex,
  HStack,
  ModalBody,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  useDisclosure,
  type FlexProps
} from '@chakra-ui/react';
import type { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { ModelScopeEnum } from '@fastgpt/global/core/ai/constants';
import {
  formatModelProviders,
  getModelProviderFromCache,
  getModelProviderListFromCache
} from '@fastgpt/global/core/ai/model/provider';
import Avatar from '@fastgpt/web/components/common/Avatar';
import CopyBox from '@fastgpt/web/components/common/String/CopyBox';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import { FixedTableLayout } from '@fastgpt/web/components/common/FixedTable';
import { useStaticVirtualList } from '@fastgpt/web/hooks/useVirtualList';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import type {
  MyModelItemType,
  PublicPriceSystemModel
} from '@fastgpt/global/openapi/core/ai/model/api';
import dynamic from 'next/dynamic';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ModelListFilters from '../ModelListFilters';
import ModelCapabilityTags from '../ModelCapabilityTags';
import TestModeBetaTag from '../TestModeBetaTag';
import ModelTabHeader from '@/pageComponents/model/ModelTabHeader';
import ModelScopeCell from '../ModelScopeCell';
import { useModelTableFormat } from '../hooks/useModelTableFormat';

const MyModal = dynamic(() => import('@fastgpt/web/components/common/MyModal'));
const modelRowHeight = 80;

const ModelTable = ({
  permissionConfig = false,
  contentPx,
  Tab
}: {
  permissionConfig?: boolean;
  contentPx?: FlexProps['px'];
  Tab?: React.ReactNode;
}) => {
  const { t, i18n } = useSafeTranslation();
  const { modelProviders: memberModelProviders, getModelProvider: getMemberModelProvider } =
    useUserModelStore();
  const { modelList: availableModels } = useModelList({ enabled: permissionConfig });
  const { data: publicCatalog } = useRequest(getPublicModelCatalog, {
    manual: permissionConfig
  });
  const publicProviderCache = useMemo(
    () => formatModelProviders(publicCatalog?.providers ?? []),
    [publicCatalog?.providers]
  );
  const getModelProvider = useCallback(
    (provider?: string, language?: string) =>
      permissionConfig
        ? getMemberModelProvider(provider, language)
        : getModelProviderFromCache({
            cache: publicProviderCache.ModelProviderMapCache,
            provider,
            language
          }),
    [permissionConfig, getMemberModelProvider, publicProviderCache.ModelProviderMapCache]
  );
  const { userInfo } = useUserStore();
  const modelPermissionConfigHint = permissionConfig
    ? t('common:model.permission_config_hint')
    : '';

  const [provider, setProvider] = useState<string | ''>('');
  const providers = useMemo(
    () =>
      getModelProviderListFromCache(
        permissionConfig ? memberModelProviders : publicProviderCache.ModelProviderListCache,
        i18n.language
      ),
    [i18n.language, memberModelProviders, permissionConfig, publicProviderCache]
  );

  const [modelType, setModelType] = useState<ModelTypeEnum | ''>('');

  const [search, setSearch] = useState('');

  type TableSourceModel = MyModelItemType | PublicPriceSystemModel;
  const remoteModels: TableSourceModel[] = permissionConfig
    ? availableModels
    : (publicCatalog?.models ?? []);

  const { formattedList: modelList } = useModelTableFormat({
    models: remoteModels,
    modelType,
    provider,
    search,
    sortByOrder: true,
    getModelProvider,
    language: i18n.language
  });

  const {
    containerRef,
    virtualDataList,
    topPlaceholderHeight,
    bottomPlaceholderHeight,
    scrollToTop
  } = useStaticVirtualList({ data: modelList, itemHeight: modelRowHeight, overscan: 10 });
  useEffect(() => {
    scrollToTop();
  }, [modelType, provider, search, scrollToTop]);
  const tableColumnCount = permissionConfig ? 4 : 3;

  return (
    <Flex flexDirection={'column'} h={contentPx === undefined ? '100%' : ['auto', '100%']} minW={0}>
      {Tab && <ModelTabHeader Tab={Tab} px={contentPx} mb={4} />}
      <ModelListFilters
        px={contentPx}
        providers={providers}
        models={remoteModels}
        provider={provider}
        onProviderChange={setProvider}
        modelType={modelType}
        onModelTypeChange={setModelType}
        search={search}
        onSearchChange={setSearch}
      />
      <FixedTableLayout
        scrollMode="virtual"
        bodyRef={containerRef}
        rootProps={{
          mt: 5,
          px: contentPx,
          flex: contentPx === undefined ? '1 0 0' : ['0 0 auto', '1 0 0'],
          h: contentPx === undefined ? 0 : ['70dvh', 0],
          w: '100%',
          maxW: '100%'
        }}
        bodyProps={{
          flex: '1 1 0',
          overflowY: 'auto',
          overflowX: 'auto'
        }}
        renderHeader={({ headerTableWidth }) => (
          <Table
            w={'100%'}
            minW={permissionConfig ? '980px' : '790px'}
            sx={{ tableLayout: 'fixed', width: `${headerTableWidth} !important` }}
          >
            <colgroup>
              <col style={{ width: '320px' }} />
              <col style={{ width: '160px' }} />
              {permissionConfig && <col style={{ width: '200px' }} />}
              <col style={{ width: '300px' }} />
            </colgroup>
            <Thead>
              <Tr color={'myGray.600'}>
                <Th fontSize={'xs'}>{t('common:model.name')}</Th>
                <Th fontSize={'xs'}>{t('common:model.model_type')}</Th>
                {permissionConfig && <Th fontSize={'xs'}>{t('config_model:available_range')}</Th>}
                <Th fontSize={'xs'}>{t('common:model.billing')}</Th>
              </Tr>
            </Thead>
          </Table>
        )}
        renderBody={() => (
          <Table
            w={'100%'}
            minW={permissionConfig ? '980px' : '790px'}
            sx={{ tableLayout: 'fixed' }}
          >
            <colgroup>
              <col style={{ width: '320px' }} />
              <col style={{ width: '160px' }} />
              {permissionConfig && <col style={{ width: '200px' }} />}
              <col style={{ width: '300px' }} />
            </colgroup>
            <Tbody>
              {topPlaceholderHeight > 0 && (
                <Tr aria-hidden>
                  <Td colSpan={tableColumnCount} h={`${topPlaceholderHeight}px`} p={0} border={0} />
                </Tr>
              )}
              {virtualDataList.map(({ data: item }) => (
                <Tr
                  key={
                    item.modelId
                      ? `model-${item.modelId}`
                      : `${item.providerId}-${item.typeLabel}-${item.name}`
                  }
                  h={`${modelRowHeight}px`}
                  sx={{ '& > td': { py: 2, whiteSpace: 'nowrap' } }}
                  _hover={{ bg: 'myGray.50' }}
                >
                  <Td fontSize={'sm'}>
                    <HStack>
                      <Avatar src={item.avatar} w={'1.2rem'} />
                      <Flex alignItems={'center'} gap={1} minW={0}>
                        <CopyBox value={item.name} data-row-action color={'myGray.900'}>
                          {item.name}
                        </CopyBox>
                        {item.scope === ModelScopeEnum.system && (
                          <MyTag type={'borderFill'} colorSchema={'gray'}>
                            {t('config_model:system_model_tag')}
                          </MyTag>
                        )}
                        {item.testMode && <TestModeBetaTag />}
                      </Flex>
                    </HStack>
                    <ModelCapabilityTags
                      mt={2}
                      contextToken={item.contextToken}
                      showVision={!!item.vision}
                      showVideo={!!item.video}
                      showAudio={!!item.audio}
                      showReasoning={!!item.reasoning}
                    />
                  </Td>
                  <Td>
                    <MyTag colorSchema={item.tagColor}>{item.typeLabel}</MyTag>
                  </Td>
                  {permissionConfig && (
                    <Td fontSize={'sm'}>
                      <ModelScopeCell
                        modelId={item.modelId}
                        scope={item.scope}
                        hasManagePer={userInfo?.team.permission.hasManagePer}
                        selectedHint={modelPermissionConfigHint}
                      />
                    </Td>
                  )}
                  <Td fontSize={'sm'}>{item.priceLabel}</Td>
                </Tr>
              ))}
              {bottomPlaceholderHeight > 0 && (
                <Tr aria-hidden>
                  <Td
                    colSpan={tableColumnCount}
                    h={`${bottomPlaceholderHeight}px`}
                    p={0}
                    border={0}
                  />
                </Tr>
              )}
            </Tbody>
          </Table>
        )}
      />
    </Flex>
  );
};

export default ModelTable;

export const ModelPriceModal = ({
  children
}: {
  children: ({ onOpen }: { onOpen: () => void }) => React.ReactNode;
}) => {
  const { t } = useSafeTranslation();
  const { isOpen, onOpen, onClose } = useDisclosure();

  return (
    <>
      {children({ onOpen })}
      {isOpen && (
        <MyModal
          isCentered
          iconSrc="/imgs/modal/bill.svg"
          title={t('common:support.wallet.subscription.Ai points')}
          isOpen
          onClose={onClose}
          w={'100%'}
          h={'100%'}
          maxW={'90vw'}
          maxH={'90vh'}
        >
          <ModalBody flex={'1 0 0'}>
            <ModelTable />
          </ModalBody>
        </MyModal>
      )}
    </>
  );
};
