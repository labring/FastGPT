import React, { useCallback, useMemo, useState } from 'react';

import { useTranslation } from 'next-i18next';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import MySelect, { type SelectProps } from '@fastgpt/web/components/common/MySelect';
import { HUGGING_FACE_ICON } from '@fastgpt/global/common/system/constants';
import { Box, Flex } from '@chakra-ui/react';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MultipleRowSelect from '@fastgpt/web/components/common/MySelect/MultipleRowSelect';
import type { ResponsiveValue } from '@chakra-ui/system';

type Props = SelectProps & {
  disableTip?: string;
  noOfLines?: ResponsiveValue<number>;
};

const OneRowSelector = ({ list, onChange, disableTip, noOfLines, ...props }: Props) => {
  const { t } = useTranslation();
  const {
    llmModelList,
    embeddingModelList,
    ttsModelList,
    sttModelList,
    reRankModelList,
    getModelProvider
  } = useSystemStore();

  const avatarSize = useMemo(() => {
    const size = {
      sm: '1rem',
      md: '1.2rem',
      lg: '1.4rem'
    };
    //@ts-ignore
    return props.size ? size[props.size] : size['md'];
  }, [props.size]);

  const avatarList = useMemo(() => {
    const allModels = [
      ...llmModelList,
      ...embeddingModelList,
      ...ttsModelList,
      ...sttModelList,
      ...reRankModelList
    ];
    return list
      .map((item) => {
        const modelData = allModels.find((model) => model.model === item.value);
        if (!modelData) return;

        const avatar = getModelProvider(modelData.provider)?.avatar;

        return {
          value: item.value,
          label: (
            <Flex alignItems={'center'} py={1}>
              <Avatar
                borderRadius={'0'}
                mr={2}
                src={avatar || HUGGING_FACE_ICON}
                w={avatarSize}
                fallbackSrc={HUGGING_FACE_ICON}
              />

              <Box noOfLines={noOfLines}>{modelData.name}</Box>
            </Flex>
          )
        };
      })
      .filter(Boolean) as {
      value: any;
      label: React.JSX.Element;
    }[];
  }, [
    llmModelList,
    embeddingModelList,
    ttsModelList,
    sttModelList,
    reRankModelList,
    list,
    getModelProvider,
    avatarSize,
    noOfLines
  ]);

  return (
    <Box
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
          placeholder={t('common:not_model_config')}
          h={'40px'}
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
  const { t, i18n } = useTranslation();
  const {
    llmModelList,
    embeddingModelList,
    ttsModelList,
    sttModelList,
    reRankModelList,
    getModelProvider,
    getModelProviders
  } = useSystemStore();
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
      .filter(Boolean);
  }, [llmModelList, embeddingModelList, ttsModelList, sttModelList, reRankModelList, list]);

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
        label: modelData.name,
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
    if (!props.value) return <>{t('common:not_model_config')}</>;
    const modelData = modelList.find((model) => model?.model === props.value);

    if (!modelData) return <>{t('common:not_model_config')}</>;

    setValue([modelData.provider, props.value]);

    const avatar = getModelProvider(modelData.provider)?.avatar;

    return (
      <Flex alignItems={'center'} py={1}>
        <Avatar
          borderRadius={'0'}
          mr={2}
          src={avatar}
          fallbackSrc={HUGGING_FACE_ICON}
          w={avatarSize}
        />
        <Box noOfLines={noOfLines}>{modelData?.name}</Box>
      </Flex>
    );
  }, [props.value, t, modelList, getModelProvider, avatarSize, noOfLines]);

  return (
    <Box
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
