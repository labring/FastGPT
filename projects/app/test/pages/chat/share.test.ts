import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { connectionMongo } from '@fastgpt/service/common/mongo';
import { serviceSideProps } from '@/web/common/i18n/utils';
import { getServerSideProps } from '@/pages/chat/share';

vi.mock('@/web/common/i18n/utils', () => ({
  serviceSideProps: vi.fn().mockResolvedValue({})
}));
vi.mock('@/components/core/chat/ChatContainer/ChatBox', () => ({ default: () => null }));
vi.mock('@/components/SideBar', () => ({ default: () => null }));
vi.mock('@/pageComponents/chat/ChatQuoteList', () => ({ default: () => null }));
vi.mock('@/pageComponents/chat/slider/ChatSliderSidebar', () => ({ default: () => null }));
vi.mock('@/pageComponents/chat/slider/ChatSliderMobileDrawer', () => ({ default: () => null }));
vi.mock('@/pageComponents/chat/ChatWindow/ChatWindowHeader', () => ({ default: () => null }));
vi.mock('@/pageComponents/chat/ToolMenu', () => ({ default: () => null }));
vi.mock('@/pageComponents/chat/SandboxEditor/hook', () => ({
  useSandboxEditor: vi.fn(),
  useSandboxStatus: vi.fn()
}));

const { ObjectId } = connectionMongo.Types;
const appId = new ObjectId();
const teamId = new ObjectId();
const tmbId = new ObjectId();
const metadata = {
  name: 'Confidential project',
  avatar: '/private-avatar.png',
  intro: 'Confidential client information'
};
const displayFlags = {
  canDownloadSource: true,
  showCite: true,
  showFullText: true,
  showRunningStatus: true,
  showSkillReferences: true
};
const fallbackProps = {
  appId: '',
  appName: 'AI',
  appAvatar: '',
  appIntro: 'AI',
  canDownloadSource: false,
  isShowCite: false,
  isShowFullText: false,
  showRunningStatus: false,
  showSkillReferences: false
};

describe('getServerSideProps', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await MongoApp.create({ _id: appId, teamId, tmbId, type: 'simple', ...metadata });
  });

  it.each(Object.values(PublishChannelEnum).filter((type) => type !== PublishChannelEnum.share))(
    'does not expose application metadata or display flags for the %s channel',
    async (type) => {
      const shareId = type === PublishChannelEnum.playground ? `playground-${appId}` : `${type}-id`;
      await MongoOutLink.create({
        appId,
        teamId,
        tmbId,
        shareId,
        type,
        name: 'Private channel',
        ...displayFlags
      });

      const result = await getServerSideProps({ query: { shareId } });

      expect(result.props).toMatchObject({ ...fallbackProps, shareId });
      expect(JSON.stringify(result.props)).not.toContain(metadata.name);
      expect(JSON.stringify(result.props)).not.toContain(metadata.intro);
    }
  );

  it('preserves metadata and display flags for a public share link', async () => {
    const shareId = 'public-share';
    await MongoOutLink.create({
      appId,
      teamId,
      tmbId,
      shareId,
      type: PublishChannelEnum.share,
      name: 'Public share',
      ...displayFlags
    });
    const context = { query: { shareId, authToken: 'token', customUid: 'custom-user' } };

    const result = await getServerSideProps(context);

    expect(result.props).toMatchObject({
      appId: String(appId),
      appName: metadata.name,
      appAvatar: metadata.avatar,
      appIntro: metadata.intro,
      canDownloadSource: true,
      isShowCite: true,
      isShowFullText: true,
      showRunningStatus: true,
      showSkillReferences: true,
      ...context.query
    });
    expect(serviceSideProps).toHaveBeenCalledWith(
      context,
      ['file', 'app', 'chat', 'workflow', 'account_team'],
      expect.any(Object)
    );
  });

  it.each(['missing-share', ''])(
    'returns safe defaults for an unknown or empty shareId: %s',
    async (shareId) => {
      const result = await getServerSideProps({ query: { shareId } });
      expect(result.props).toMatchObject({
        ...fallbackProps,
        shareId,
        authToken: '',
        customUid: ''
      });
    }
  );

  it('returns safe defaults when the linked application no longer exists', async () => {
    await MongoOutLink.create({
      appId: new ObjectId(),
      teamId,
      tmbId,
      shareId: 'deleted-app',
      type: PublishChannelEnum.share,
      name: 'Deleted app'
    });

    const result = await getServerSideProps({ query: { shareId: 'deleted-app' } });

    expect(result.props).toMatchObject({ appName: 'AI', appAvatar: '', appIntro: 'AI' });
  });
});
