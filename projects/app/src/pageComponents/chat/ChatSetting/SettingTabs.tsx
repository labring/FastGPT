import { useMemo } from 'react';
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';
import { useTranslation } from 'react-i18next';
import { ChatSettingTabOptionEnum } from '@/pageComponents/chat/constants';
import { Flex } from '@chakra-ui/react';

type Props = {
  tab: `${ChatSettingTabOptionEnum}`;
  onChange: (tab: `${ChatSettingTabOptionEnum}`) => void;
  children?: React.ReactNode;
};

const SettingTabs = ({ tab, children, onChange }: Props) => {
  const { t } = useTranslation();

  const tabOptions: Parameters<typeof FillRowTabs<`${ChatSettingTabOptionEnum}`>>[0]['list'] =
    useMemo(
      () => [
        { label: t('chat:setting.home.title'), value: ChatSettingTabOptionEnum.HOME },
        {
          label: t('chat:setting.data_dashboard.title'),
          value: ChatSettingTabOptionEnum.DATA_DASHBOARD
        },
        { label: t('chat:setting.log_details.title'), value: ChatSettingTabOptionEnum.LOG_DETAILS }
      ],
      [t]
    );

  return (
    <Flex w="100%" justifyContent={'space-between'} gap={4} alignItems={'center'}>
      <FillRowTabs px={3} py={2} list={tabOptions} value={tab} onChange={onChange} />

      {children}
    </Flex>
  );
};

export default SettingTabs;
