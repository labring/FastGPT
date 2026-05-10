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
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useTranslation } from 'next-i18next';
import React, { useCallback, useMemo, useState } from 'react';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';

type Props = SelectProps & {
  disableTip?: string;
  noOfLines?: ResponsiveValue<number>;
  cacheModel?: boolean;
};

const isTestModeModel = (model?: SystemModelItemType) => {
  return !!model?.testMode;
};
const isMultimodalEmbeddingModel = (model?: SystemModelItemType) => {
  return model?.type === ModelTypeEnum.embedding && !!model.vision;
};

const multimodalTagStyles = {
  display: 'inline-flex',
  px: '8px',
  py: '4px',
  justifyContent: 'center',
  alignItems: 'center',
  gap: '6px',
  borderRadius: '6px',
  bg: '#F0FBFF',
  color: '#005B9C',
  fontFamily: 'PingFang SC',
  fontSize: '10px',
  fontStyle: 'normal',
  fontWeight: 500,
  lineHeight: '14px',
  letterSpacing: '0.2px',
  flexShrink: 0
} as const;

const modelOptionRowStyles = {
  w: '320px',
  h: '45px',
  px: '12px',
  py: '6px',
  justifyContent: 'flex-start',
  alignItems: 'center',
  alignSelf: 'stretch',
  gap: '10px',
  borderRadius: '4px'
} as const;

const modelNameTextStyles = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
} as const;

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
  const { t } = useTranslation();

  return (
    <Flex alignItems={'center'} flex={'1 1 0'} w={'100%'} minW={0} overflow={'hidden'} gap={1}>
      <Box flex={'1 1 0'} minW={0} {...modelNameTextStyles}>
        {name}
      </Box>
      {(showTestModeTip || showMultimodalTip) && (
        <Flex alignItems={'center'} gap={1} flexShrink={0}>
          {showTestModeTip && (
            <Box flexShrink={0} pointerEvents={'auto'}>
              <TestModeBetaTag />
            </Box>
          )}
          {showMultimodalTip && (
            <MyTooltip label={t('common:core.ai.model.multimodal_tip')} shouldWrapChildren={false}>
              <Box {...multimodalTagStyles}>{t('common:core.ai.model.multimodal')}</Box>
            </MyTooltip>
          )}
        </Flex>
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

  const avatarSize = useMemo(() => {
    const size = {
      sm: '1rem',
      md: '1.2rem',
      lg: '1.4rem'
    };
    //@ts-ignore
    return props.size ? size[props.size] : size['md'];
  }, [props.size]);
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
            <Flex {...modelOptionRowStyles} minW={0}>
              <Avatar
                flexShrink={0}
                borderRadius={'0'}
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
          itemStyle={{
            p: 0,
            mb: 0.5,
            borderRadius: '4px',
            _hover: {
              bg: 'rgba(17, 24, 36, 0.05)'
            }
          }}
          selectedItemStyle={{
            color: 'primary.700',
            bg: 'rgba(17, 24, 36, 0.05)'
          }}
          valueLabel={
            selectedModelData ? (
              <Flex alignItems={'center'} py={1} w={'100%'} minW={0} overflow={'hidden'}>
                <Avatar
                  flexShrink={0}
                  borderRadius={'0'}
                  mr={2}
                  src={getModelProvider(selectedModelData.provider)?.avatar || HUGGING_FACE_ICON}
                  w={avatarSize}
                  fallbackSrc={HUGGING_FACE_ICON}
                />
                <ModelOptionLabel
                  name={selectedModelData.name}
                  noOfLines={noOfLines}
                  showTestModeTip={isTestModeModel(selectedModelData)}
                  showMultimodalTip={isMultimodalEmbeddingModel(selectedModelData)}
                />
              </Flex>
            ) : undefined
          }
          placeholder={loading ? t('common:model_loading') : t('common:not_model_config')}
          h={'40px'}
          whiteSpace={'nowrap'}
          sx={{
            '& > div, & > div > div': {
              flex: '1 1 auto',
              minWidth: 0,
              overflow: 'hidden'
            }
          }}
          {...props}
          onChange={(e) => {
            return onChange?.(e);
          }}
        />
      </MyTooltip>
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

  const [value, setValue] = useState<string[]>([]);

  const avatarSize = useMemo(() => {
    const size = {
      sm: '1rem',
      md: '1.2rem',
      lg: '1.4rem'
    };
    //@ts-ignore
    return props.size ? size[props.size] : size['md'];
  }, [props.size]);
  const selectorList = useMemo(() => {
    const renderList = getModelProviders(i18n.language).map<{
      label: React.JSX.Element;
      value: string;
      children: { label: string | React.ReactNode; value: string }[];
    }>((provider) => ({
      label: (
        <Flex alignItems={'center'} py={1}>
          <Avatar
            flexShrink={0}
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
          <Flex w={'320px'} minW={0}>
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
    const modelData = modelList.find((model) => model?.model === props.value);

    if (!modelData) return <>{t('common:not_model_config')}</>;

    setValue([modelData.provider, props.value]);

    const avatar = getModelProvider(modelData.provider)?.avatar;

    return (
      <Flex alignItems={'center'} py={1} w={'100%'} minW={0} overflow={'hidden'}>
        <Avatar
          flexShrink={0}
          borderRadius={'0'}
          mr={2}
          src={avatar}
          fallbackSrc={HUGGING_FACE_ICON}
          w={avatarSize}
        />
        <ModelOptionLabel
          name={modelData.name}
          noOfLines={noOfLines}
          showTestModeTip={isTestModeModel(modelData)}
          showMultimodalTip={isMultimodalEmbeddingModel(modelData)}
        />
      </Flex>
    );
  }, [loading, props.value, t, modelList, getModelProvider, avatarSize, noOfLines]);

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
            ...props
          }}
        />
      </MyTooltip>
    </Box>
  );
};

const AIModelSelector = (props: Props) => {
  return props.list.length > 10 ? (
    <MultipleRowSelector {...props} />
  ) : (
    <OneRowSelector {...props} />
  );
};

export default AIModelSelector;
