import { useSystemStore } from '@/web/common/system/useSystemStore';
import { Box, Flex } from '@chakra-ui/react';
import type { ResponsiveValue } from '@chakra-ui/system';
import type { SystemModelItemType } from '@fastgpt/service/core/ai/type';
import { HUGGING_FACE_ICON } from '@fastgpt/global/common/system/constants';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MySelect, { type SelectProps } from '@fastgpt/web/components/common/MySelect';
import MultipleRowSelect from '@fastgpt/web/components/common/MySelect/MultipleRowSelect';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import TestModeBetaTag from '@/components/core/ai/TestModeBetaTag';
import MultimodalTag from '@/components/core/ai/MultimodelTag';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useTranslation } from 'next-i18next';
import React, { useCallback, useMemo } from 'react';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';

type Props = SelectProps & {
  disableTip?: string;
  noOfLines?: ResponsiveValue<number>;
  cacheModel?: boolean;
};

const modelAvatarSizeMap = {
  sm: '1rem',
  md: '1.2rem',
  lg: '1.4rem'
} as const;

const getModelAvatarSize = (size?: Props['size']) => {
  if (typeof size === 'string' && size in modelAvatarSizeMap) {
    return modelAvatarSizeMap[size as keyof typeof modelAvatarSizeMap];
  }

  return modelAvatarSizeMap.md;
};

const isTestModeModel = (model?: SystemModelItemType) => {
  return !!model?.testMode;
};
const isMultimodalEmbeddingModel = (model?: SystemModelItemType) => {
  return model?.type === ModelTypeEnum.embedding && !!model.vision;
};

const SelectorActiveModelTags = React.memo(function SelectorActiveModelTags({
  model
}: {
  model?: SystemModelItemType;
}) {
  const showTestModeTip = isTestModeModel(model);
  const showMultimodalTip = isMultimodalEmbeddingModel(model);

  if (!showTestModeTip && !showMultimodalTip) return null;

  return (
    <Box
      position={'absolute'}
      top={'50%'}
      right={'40px'}
      transform={'translateY(-50%)'}
      zIndex={3}
      display={'flex'}
      alignItems={'center'}
      gap={1}
    >
      {showTestModeTip && <TestModeBetaTag />}
      {showMultimodalTip && <MultimodalTag />}
    </Box>
  );
});

const ModelOptionLabel = React.memo(function ModelOptionLabel({
  name,
  showTestModeTip,
  showMultimodalTip,
  noOfLines
}: {
  name: string;
  showTestModeTip: boolean;
  showMultimodalTip?: boolean;
  noOfLines?: ResponsiveValue<number>;
}) {
  return (
    <Flex alignItems={'center'} flex={'1 1 0'} w={'100%'} minW={0} overflow={'hidden'}>
      <Box noOfLines={noOfLines ?? 1} flex={'1 1 0'} minW={0} overflow={'hidden'}>
        {name}
      </Box>
      {showTestModeTip && (
        <Box ml={1} flexShrink={0} pointerEvents={'auto'}>
          <TestModeBetaTag />
        </Box>
      )}
      {showMultimodalTip && (
        <Box ml={1} flexShrink={0} pointerEvents={'auto'}>
          <MultimodalTag />
        </Box>
      )}
    </Flex>
  );
});

const OneRowSelector = ({
  list,
  onChange,
  disableTip,
  noOfLines,
  cacheModel = true,
  ...props
}: Props) => {
  const { t } = useTranslation(['common', 'account']);

  const {
    llmModelList,
    embeddingModelList,
    ttsModelList,
    sttModelList,
    reRankModelList,
    getModelProvider,
    getMyModelList
  } = useSystemStore();

  const { data: myModels, loading } = useRequest(
    async () => {
      const set = await getMyModelList();
      if (cacheModel) {
        set.add(props.value);
      }
      return set;
    },
    {
      manual: false
    }
  );

  const avatarSize = useMemo(() => getModelAvatarSize(props.size), [props.size]);
  const allModels = useMemo(
    () => [
      ...llmModelList,
      ...embeddingModelList,
      ...ttsModelList,
      ...sttModelList,
      ...reRankModelList
    ],
    [llmModelList, embeddingModelList, ttsModelList, sttModelList, reRankModelList]
  );
  const selectedModelData = useMemo(
    () => allModels.find((model) => model.model === props.value),
    [allModels, props.value]
  );

  const avatarList = useMemo(() => {
    return list
      .map((item) => {
        const modelData = allModels.find((model) => model.model === item.value);
        if (!modelData) return;

        const avatar = getModelProvider(modelData.provider)?.avatar;
        if (!myModels?.has(modelData.model)) {
          return;
        }
        return {
          value: item.value,
          label: (
            <Flex alignItems={'center'} py={1} w={'100%'} minW={0}>
              <Avatar
                borderRadius={'0'}
                mr={2}
                src={avatar || HUGGING_FACE_ICON}
                w={avatarSize}
                fallbackSrc={HUGGING_FACE_ICON}
              />
              <ModelOptionLabel
                name={modelData.name}
                noOfLines={noOfLines}
                showTestModeTip={isTestModeModel(modelData)}
                showMultimodalTip={isMultimodalEmbeddingModel(modelData)}
              />
            </Flex>
          )
        };
      })
      .filter(Boolean) as {
      value: any;
      label: React.JSX.Element;
    }[];
  }, [allModels, list, getModelProvider, avatarSize, noOfLines, myModels]);

  return (
    <Box
      position={'relative'}
      css={{
        span: {
          display: 'block'
        }
      }}
    >
      <MyTooltip label={disableTip}>
        <MySelect
          className="nowheel"
          isDisabled={!!disableTip}
          list={avatarList}
          valueLabel={
            selectedModelData ? (
              <Flex alignItems={'center'} py={1} minW={0} overflow={'hidden'}>
                <ModelOptionLabel
                  name={selectedModelData.name}
                  noOfLines={noOfLines}
                  showTestModeTip={false}
                  showMultimodalTip={false}
                />
              </Flex>
            ) : undefined
          }
          placeholder={loading ? t('common:model_loading') : t('common:not_model_config')}
          h={'40px'}
          whiteSpace={'nowrap'}
          {...props}
          borderRadius={'10px'}
          onChange={(e) => {
            return onChange?.(e);
          }}
        />
      </MyTooltip>
      <SelectorActiveModelTags model={selectedModelData} />
    </Box>
  );
};

const MultipleRowSelector = ({
  list,
  onChange,
  disableTip,
  placeholder,
  noOfLines,
  ...props
}: Props) => {
  const { t, i18n } = useTranslation(['common', 'account']);
  const {
    llmModelList,
    embeddingModelList,
    ttsModelList,
    sttModelList,
    reRankModelList,
    getModelProvider,
    getModelProviders,
    getMyModelList
  } = useSystemStore();

  const { data: myModels, loading } = useRequest(getMyModelList, {
    manual: false
  });

  const modelList = useMemo(() => {
    const allModels = [
      ...llmModelList,
      ...embeddingModelList,
      ...ttsModelList,
      ...sttModelList,
      ...reRankModelList
    ];

    return list
      .map((item) => allModels.find((model) => model.model === item.value))
      .filter((item) => !!item && !!myModels?.has(item.model));
  }, [
    llmModelList,
    embeddingModelList,
    ttsModelList,
    sttModelList,
    reRankModelList,
    list,
    myModels
  ]);

  const avatarSize = useMemo(() => getModelAvatarSize(props.size), [props.size]);
  const selectedModelData = useMemo(
    () => modelList.find((model) => model?.model === props.value),
    [modelList, props.value]
  );
  const value = useMemo(
    () => (selectedModelData ? [selectedModelData.provider, selectedModelData.model] : []),
    [selectedModelData]
  );

  const selectorList = useMemo(() => {
    const renderList = getModelProviders(i18n.language).map<{
      label: React.JSX.Element;
      value: string;
      children: { label: string | React.ReactNode; value: string }[];
    }>((provider) => ({
      label: (
        <Flex alignItems={'center'} py={1}>
          <Avatar
            borderRadius={'0'}
            mr={2}
            src={provider?.avatar || HUGGING_FACE_ICON}
            fallbackSrc={HUGGING_FACE_ICON}
            w={avatarSize}
          />
          <Box>{provider.name}</Box>
        </Flex>
      ),
      value: provider.id,
      children: []
    }));

    for (const item of list) {
      const modelData = modelList.find((model) => model?.model === item.value);
      if (!modelData) continue;
      const provider =
        renderList.find((item) => item.value === (modelData?.provider || 'Other')) ??
        renderList[renderList.length - 1];

      provider?.children.push({
        label: (
          <Flex w={'100%'} minW={0}>
            <ModelOptionLabel
              name={modelData.name}
              showTestModeTip={isTestModeModel(modelData)}
              showMultimodalTip={isMultimodalEmbeddingModel(modelData)}
            />
          </Flex>
        ),
        value: modelData.model
      });
    }

    return renderList.filter((item) => item.children.length > 0);
  }, [getModelProviders, i18n.language, avatarSize, list, modelList]);

  const onSelect = useCallback(
    (e: string[]) => {
      return onChange?.(e[1]);
    },
    [onChange]
  );

  const SelectedLabel = useMemo(() => {
    if (loading) return <>{t('common:model_loading')}</>;
    if (!props.value) return <>{t('common:not_model_config')}</>;
    if (!selectedModelData) return <>{t('common:not_model_config')}</>;

    return (
      <Flex alignItems={'center'} py={1} minW={0} overflow={'hidden'}>
        <ModelOptionLabel
          name={selectedModelData.name}
          noOfLines={noOfLines}
          showTestModeTip={false}
          showMultimodalTip={false}
        />
      </Flex>
    );
  }, [loading, props.value, t, selectedModelData, noOfLines]);

  return (
    <Box
      position={'relative'}
      css={{
        span: {
          display: 'block'
        }
      }}
    >
      <MyTooltip label={disableTip}>
        <MultipleRowSelect
          label={SelectedLabel}
          list={selectorList}
          onSelect={onSelect}
          value={value}
          placeholder={placeholder}
          rowMinWidth="160px"
          ButtonProps={{
            isDisabled: !!disableTip,
            h: '40px',
            whiteSpace: 'nowrap',
            ...props,
            borderRadius: '10px'
          }}
        />
      </MyTooltip>
      <SelectorActiveModelTags model={selectedModelData} />
    </Box>
  );
};

const ChatAIModelSelector = (props: Props) => {
  return props.list.length > 10 ? (
    <MultipleRowSelector {...props} />
  ) : (
    <OneRowSelector {...props} />
  );
};

export default ChatAIModelSelector;
