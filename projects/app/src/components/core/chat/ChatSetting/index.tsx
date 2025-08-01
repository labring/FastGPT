import CopyrightSetting from '@/components/core/chat/ChatSetting/CopyrightSetting';
import HomepageSetting from '@/components/core/chat/ChatSetting/HomepageSetting';
import DiagramModal from '@/components/core/chat/ChatSetting/DiagramModal';
import { useState } from 'react';
import { ChatSettingTabOptionEnum } from '@/global/core/chat/constants';
import type { ChatSettingSchema } from '@fastgpt/global/core/chat/type';

type Props = {
  settings: ChatSettingSchema | null;
  onSettingsRefresh: () => Promise<void>;
};

const ChatSetting = ({ settings, onSettingsRefresh }: Props) => {
  //------------ states ------------//
  const [isOpenDiagram, setIsOpenDiagram] = useState(false);
  const [tab, setTab] = useState<`${ChatSettingTabOptionEnum}`>('copyright');

  return (
    <>
      {/* homepage setting */}
      {tab === ChatSettingTabOptionEnum.HOME && (
        <HomepageSetting
          settingTabOption={tab}
          slogan={settings?.slogan}
          dialogTips={settings?.dialogTips}
          onDiagramShow={setIsOpenDiagram}
          onTabChange={setTab}
          onSettingsRefresh={onSettingsRefresh}
        />
      )}

      {/* copyright setting */}
      {tab === ChatSettingTabOptionEnum.COPYRIGHT && (
        <CopyrightSetting
          logos={{
            wideLogoUrl: settings?.wideLogoUrl,
            squareLogoUrl: settings?.squareLogoUrl
          }}
          settingTabOption={tab}
          onDiagramShow={setIsOpenDiagram}
          onTabChange={setTab}
          onSettingsRefresh={onSettingsRefresh}
        />
      )}

      <DiagramModal show={isOpenDiagram} onShow={setIsOpenDiagram} />
    </>
  );
};

export default ChatSetting;
