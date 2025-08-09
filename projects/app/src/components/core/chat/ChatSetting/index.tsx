import DiagramModal from '@/components/core/chat/ChatSetting/DiagramModal';
import { useState } from 'react';
import { ChatSettingTabOptionEnum } from '@/global/core/chat/constants';
import type { ChatSettingSchema } from '@fastgpt/global/core/chat/type';
import dynamic from 'next/dynamic';

const HomepageSetting = dynamic(() => import('@/components/core/chat/ChatSetting/HomepageSetting'));

type Props = {
  settings: ChatSettingSchema | null;
  onSettingsRefresh: () => Promise<ChatSettingSchema | null>;
};

const ChatSetting = ({ settings, onSettingsRefresh }: Props) => {
  //------------ states ------------//
  const [isOpenDiagram, setIsOpenDiagram] = useState(false);
  const [tab, setTab] = useState<`${ChatSettingTabOptionEnum}`>('home');

  return (
    <>
      {/* homepage setting */}
      {tab === ChatSettingTabOptionEnum.HOME && (
        <HomepageSetting
          settingTabOption={tab}
          slogan={settings?.slogan}
          dialogTips={settings?.dialogTips}
          homeTabTitle={settings?.homeTabTitle}
          selectedTools={settings?.selectedTools}
          logos={{
            wideLogoUrl: settings?.wideLogoUrl,
            squareLogoUrl: settings?.squareLogoUrl
          }}
          onTabChange={setTab}
          onDiagramShow={setIsOpenDiagram}
          onSettingsRefresh={onSettingsRefresh}
        />
      )}

      <DiagramModal show={isOpenDiagram} onShow={setIsOpenDiagram} />
    </>
  );
};

export default ChatSetting;
