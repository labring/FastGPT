import React, { useCallback, useMemo, useState } from 'react';

import { useTranslation } from 'next-i18next';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import MySelect, { SelectProps } from '@fastgpt/web/components/common/MySelect';
import { HUGGING_FACE_ICON, LOGO_ICON } from '@fastgpt/global/common/system/constants';
import { Box, Flex, HStack, useDisclosure } from '@chakra-ui/react';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import dynamic from 'next/dynamic';
import { ModelProviderList } from '@fastgpt/global/core/ai/provider';
import MultipleRowSelect from '@fastgpt/web/components/common/MySelect/MultipleRowSelect';
import { getModelFromList } from '@fastgpt/global/core/ai/model';

const ModelPriceModal = dynamic(() =>
  import('@/components/core/ai/ModelTable').then((mod) => mod.ModelPriceModal)
);

type Props = SelectProps & {
  disableTip?: string;
};

const OneRowSelector = ({ list, onchange, disableTip, ...props }: Props) => {
  const { t } = useTranslation();
  const { feConfigs, llmModelList, vectorModelList } = useSystemStore();

  const avatarSize = useMemo(() => {
    const size = {
      sm: '1rem',
      md: '1.2rem',
      lg: '1.4rem'
    };
    //@ts-ignore
    return props.size ? size[props.size] : size['md'];
  }, [props.size]);

  const avatarList = list.map((item) => {
    const modelData = getModelFromList([...llmModelList, ...vectorModelList], item.value);

    return {
      value: item.value,
      label: (
        <Flex alignItems={'center'} py={1}>
          <Avatar
            borderRadius={'0'}
            mr={2}
            src={modelData?.avatar || HUGGING_FACE_ICON}
            fallbackSrc={HUGGING_FACE_ICON}
            w={avatarSize}
          />
          <Box>{modelData.name}</Box>
        </Flex>
      )
    };
  });

  const expandList = useMemo(() => {
    return feConfigs?.show_pay
      ? avatarList.concat({
          label: (
            <Flex alignItems={'center'}>
              <Avatar borderRadius={'0'} mr={2} src={LOGO_ICON} w={avatarSize} />
              <Box>{t('common:support.user.Price')}</Box>
            </Flex>
          ),
          value: 'price'
        })
      : avatarList;
  }, [feConfigs.show_pay, avatarList, avatarSize, t]);

  return (
    <Box
      css={{
        span: {
          display: 'block'
        }
      }}
    >
      <MyTooltip label={disableTip}>
        <ModelPriceModal>
          {({ onOpen }) => (
            <MySelect
              className="nowheel"
              isDisabled={!!disableTip}
              list={expandList}
              {...props}
              onchange={(e) => {
                if (e === 'price') {
                  onOpen();
                  return;
                }
                return onchange?.(e);
              }}
            />
          )}
        </ModelPriceModal>
      </MyTooltip>
    </Box>
  );
};
const MultipleRowSelector = ({ list, onchange, disableTip, ...props }: Props) => {
  const { t } = useTranslation();
  const { llmModelList, vectorModelList } = useSystemStore();
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
    const renderList = ModelProviderList.map<{
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
          <Box>{t(provider.name as any)}</Box>
        </Flex>
      ),
      value: provider.id,
      children: []
    }));

    for (const item of list) {
      const modelData = getModelFromList([...llmModelList, ...vectorModelList], item.value);
      const provider =
        renderList.find((item) => item.value === (modelData?.provider || 'Other')) ??
        renderList[renderList.length - 1];

      provider.children.push({
        label: modelData.name,
        value: modelData.model
      });
    }

    return renderList.filter((item) => item.children.length > 0);
  }, [avatarSize, list, llmModelList, t, vectorModelList]);

  const onSelect = useCallback(
    (e: string[]) => {
      return onchange?.(e[1]);
    },
    [onchange]
  );

  const SelectedModel = useMemo(() => {
    const modelData = getModelFromList([...llmModelList, ...vectorModelList], props.value);

    setValue([modelData.provider, props.value]);

    return (
      <HStack spacing={1}>
        <Avatar
          borderRadius={'0'}
          mr={2}
          src={modelData?.avatar}
          fallbackSrc={HUGGING_FACE_ICON}
          w={avatarSize}
        />
        <Box>{modelData?.name}</Box>
      </HStack>
    );
  }, [avatarSize, llmModelList, props.value, vectorModelList]);

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
          label={SelectedModel}
          list={selectorList}
          onSelect={onSelect}
          value={value}
          rowMinWidth="160px"
          ButtonProps={{
            isDisabled: !!disableTip
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
