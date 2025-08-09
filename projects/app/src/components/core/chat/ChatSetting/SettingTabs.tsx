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
      () => [{ label: t('chat:setting.home.title'), value: ChatSettingTabOptionEnum.HOME }],
      [t]
    );

  return (
    <Flex w="100%" flexShrink={0} justifyContent={'space-between'} gap={4} alignItems={'center'}>
      <FillRowTabs px={3} py={2} list={tabOptions} value={tab} onChange={onChange} />

      {children}
    </Flex>
  );
};

export default SettingTabs;
