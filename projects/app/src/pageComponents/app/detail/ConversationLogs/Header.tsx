import React from 'react';
import { Flex, Box, Text } from '@chakra-ui/react';
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';
import { ChatLogsFilterEnum } from '@fastgpt/global/core/chat/correction/constants';
import CloseIcon from '@fastgpt/web/components/common/Icon/close';
import { useTranslation } from 'next-i18next';

type Props = {
  activeTab: ChatLogsFilterEnum;
  onTabChange: (tab: ChatLogsFilterEnum) => void;
  onClose: () => void;
  title: string;
  totalCount?: number;
  goodTotal?: number;
  badTotal?: number;
  notFoundTotal?: number;
};

const Header = ({
  activeTab,
  onTabChange,
  onClose,
  title,
  totalCount = 0,
  goodTotal = 0,
  badTotal = 0,
  notFoundTotal = 0
}: Props) => {
  const { t } = useTranslation();

  // 根据当前过滤条件显示对应的数量
  const getTabCount = (tabValue: ChatLogsFilterEnum) => {
    switch (tabValue) {
      case ChatLogsFilterEnum.all:
        return totalCount; // 全部记录的总数
      case ChatLogsFilterEnum.good:
        return goodTotal;
      case ChatLogsFilterEnum.bad:
        return badTotal;
      case ChatLogsFilterEnum.notFoundKnowledge:
        return notFoundTotal;
      default:
        return 0;
    }
  };

  const tabList = [
    {
      label: `${t('app:logs_filter_all')}(${getTabCount(ChatLogsFilterEnum.all)})`,
      value: ChatLogsFilterEnum.all
    },
    {
      label: `${t('app:logs_filter_bad')}(${getTabCount(ChatLogsFilterEnum.bad)})`,
      value: ChatLogsFilterEnum.bad
    },
    {
      label: `${t('app:logs_filter_good')}(${getTabCount(ChatLogsFilterEnum.good)})`,
      value: ChatLogsFilterEnum.good
    },
    {
      label: `${t('app:logs_filter_not_found_knowledge')}(${getTabCount(ChatLogsFilterEnum.notFoundKnowledge)})`,
      value: ChatLogsFilterEnum.notFoundKnowledge
    }
  ];

  return (
    <Flex
      alignItems={'center'}
      px={[1, 1]}
      w={'100%'}
      justifyContent={'space-between'}
      h={['46px', '60px']}
      borderBottom={'base'}
      borderBottomColor={'gray.200'}
      color={'myGray.900'}
      position={'relative'}
    >
      <Text maxW={'240px'} className="textEllipsis" title={title}>
        {title}
      </Text>
      <FillRowTabs<ChatLogsFilterEnum>
        list={tabList}
        position={'absolute'}
        transform={'translateX(-50%)'}
        value={activeTab}
        py={1}
        left={'50%'}
        onChange={onTabChange}
      />
      <CloseIcon onClick={onClose} />
    </Flex>
  );
};

export default Header;
