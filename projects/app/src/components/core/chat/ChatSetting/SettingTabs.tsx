import { useMemo } from 'react';
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';
import { useTranslation } from 'react-i18next';
import { ChatSettingTabOptionEnum } from '@/global/core/chat/constants';

type Props = {
  settingTabOption: `${ChatSettingTabOptionEnum}`;
  onTabChange: (tab: `${ChatSettingTabOptionEnum}`) => void;
};

const SettingTabs = ({ settingTabOption, onTabChange }: Props) => {
  const { t } = useTranslation();

  const tabOptions: Parameters<typeof FillRowTabs<`${ChatSettingTabOptionEnum}`>>[0]['list'] =
    useMemo(
      () => [{ label: t('chat:setting.home.title'), value: ChatSettingTabOptionEnum.HOME }],
      [t]
    );

  return (
    <FillRowTabs px={3} py={2} list={tabOptions} value={settingTabOption} onChange={onTabChange} />
  );
};

export default SettingTabs;
