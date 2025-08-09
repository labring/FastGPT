import DiagramModal from '@/components/core/chat/ChatSetting/DiagramModal';
import { useCallback, useMemo, useState } from 'react';
import { ChatSettingTabOptionEnum } from '@/web/components/chat/constants';
import type { ChatSettingSchema } from '@fastgpt/global/core/chat/setting/type';
import dynamic from 'next/dynamic';
import SettingTabs from '@/components/core/chat/ChatSetting/SettingTabs';

const HomepageSetting = dynamic(() => import('@/components/core/chat/ChatSetting/HomepageSetting'));

type Props = {
  settings: ChatSettingSchema | null;
  onSettingsRefresh: () => Promise<ChatSettingSchema | null>;
};

const ChatSetting = ({ settings, onSettingsRefresh }: Props) => {
  const [isOpenDiagram, setIsOpenDiagram] = useState(false);
  const [tab, setTab] = useState<`${ChatSettingTabOptionEnum}`>('home');

  const SettingHeader = useCallback(
    ({ children }: { children?: React.ReactNode }) => (
      <SettingTabs tab={tab} onChange={setTab}>
        {children}
      </SettingTabs>
    ),
    [tab, setTab]
  );

  return (
    <>
      {/* homepage setting */}
      {tab === ChatSettingTabOptionEnum.HOME && (
        <HomepageSetting
          Header={SettingHeader}
          slogan={settings?.slogan}
          dialogTips={settings?.dialogTips}
          homeTabTitle={settings?.homeTabTitle}
          selectedTools={settings?.selectedTools}
          logos={{
            wideLogoUrl: settings?.wideLogoUrl,
            squareLogoUrl: settings?.squareLogoUrl
          }}
          onDiagramShow={setIsOpenDiagram}
          onSettingsRefresh={onSettingsRefresh}
        />
      )}

      <DiagramModal show={isOpenDiagram} onShow={setIsOpenDiagram} />
    </>
  );
};

export default ChatSetting;
