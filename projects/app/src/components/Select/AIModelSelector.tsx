import React, { useCallback, useMemo } from 'react';

import { useTranslation } from 'next-i18next';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useRouter } from 'next/router';
import { AI_POINT_USAGE_CARD_ROUTE } from '@/web/support/wallet/sub/constants';
import MySelect, { SelectProps } from '@fastgpt/web/components/common/MySelect';
import { HUGGING_FACE_ICON, LOGO_ICON } from '@fastgpt/global/common/system/constants';
import { Box, Flex } from '@chakra-ui/react';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';

type Props = SelectProps & {
  disableTip?: string;
};

const AIModelSelector = ({ list, onchange, disableTip, ...props }: Props) => {
  const { t } = useTranslation();
  const { feConfigs, llmModelList, vectorModelList } = useSystemStore();
  const router = useRouter();

  const avatarList = list.map((item) => {
    const modelData =
      llmModelList.find((model) => model.model === item.value) ||
      vectorModelList.find((model) => model.model === item.value);

    return {
      value: item.value,
      label: (
        <Flex alignItems={'center'} py={1}>
          <Avatar
            borderRadius={'0'}
            mr={2}
            src={modelData?.avatar || HUGGING_FACE_ICON}
            fallbackSrc={HUGGING_FACE_ICON}
            w={'18px'}
          />
          <Box>{item.label}</Box>
        </Flex>
      )
    };
  });

  const expandList = useMemo(() => {
    return feConfigs.show_pay
      ? avatarList.concat({
          label: (
            <Flex alignItems={'center'}>
              <Avatar borderRadius={'0'} mr={2} src={LOGO_ICON} w={'18px'} />
              <Box>{t('common:support.user.Price')}</Box>
            </Flex>
          ),
          value: 'price'
        })
      : avatarList;
  }, [feConfigs.show_pay, avatarList, t]);

  const onSelect = useCallback(
    (e: string) => {
      if (e === 'price') {
        router.push(AI_POINT_USAGE_CARD_ROUTE);
        return;
      }
      return onchange?.(e);
    },
    [onchange, router]
  );

  return (
    <MyTooltip label={disableTip}>
      <MySelect
        className="nowheel"
        isDisabled={!!disableTip}
        list={expandList}
        {...props}
        onchange={onSelect}
      />
    </MyTooltip>
  );
};

export default AIModelSelector;
