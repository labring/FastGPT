import DiagramModal from '@/components/core/chat/ChatSetting/DiagramModal';
import { useCallback, useState } from 'react';
import { ChatSettingTabOptionEnum } from '@/pageComponents/chat/constants';
import dynamic from 'next/dynamic';
import SettingTabs from '@/components/core/chat/ChatSetting/SettingTabs';

const HomepageSetting = dynamic(() => import('@/components/core/chat/ChatSetting/HomepageSetting'));

const ChatSetting = () => {
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
        <HomepageSetting Header={SettingHeader} onDiagramShow={setIsOpenDiagram} />
      )}

      <DiagramModal show={isOpenDiagram} onShow={setIsOpenDiagram} />
    </>
  );
};

export default ChatSetting;
