import { type ReactNode } from 'react';
import { source } from '@/lib/source';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { baseOptions } from '@/app/layout.config';
import { t, getLocalizedPath, i18n } from '@/lib/i18n';
import '@/app/global.css';
import { CustomSidebarComponents } from '@/components/sideBar';
import { SidebarKeepOpen } from '@/components/sidebarKeepOpen';
import { SidebarScrollFix } from '@/components/sidebarScrollFix';
import FeishuLogoLight from '@/components/docs/feishuLogoLIght';
import FeishuLogoDark from '@/components/docs/feishuLogoDark';
import GithubLogoLight from '@/components/docs/githubLogoLight';
import GithubLogoDark from '@/components/docs/githubLogoDark';
import { BookOpen, Code, Lightbulb, CircleHelp, Server } from 'lucide-react';

export default async function Layout({
  params,
  children
}: {
  params: Promise<{ lang: string }>;
  children: ReactNode;
}) {
  const { lang } = await params;

  const iconClass = 'size-4';
  const tab = [
    {
      icon: <BookOpen className={iconClass} />,
      title: t('common:introduction', lang),
      url: getLocalizedPath('/docs/introduction', lang)
    },
    {
      icon: <Lightbulb className={iconClass} />,
      title: t('common:use-cases', lang),
      url: getLocalizedPath('/docs/use-cases', lang)
    },
    {
      icon: <Server className={iconClass} />,
      title: t('common:selfHost', lang),
      url: getLocalizedPath('/docs/self-host', lang)
    },
    {
      icon: <Code className={iconClass} />,
      title: t('common:api_reference', lang),
      url: getLocalizedPath('/docs/openapi', lang)
    },
    {
      icon: <CircleHelp className={iconClass} />,
      title: t('common:faq', lang),
      url: getLocalizedPath('/docs/faq', lang)
    }
  ];

  const tabUrls = tab.map((t) => t.url);

  return (
    <DocsLayout
      {...baseOptions(lang)}
      tree={source.pageTree[lang] || source.pageTree[i18n.defaultLanguage]}
      searchToggle={{
        enabled: true
      }}
      sidebar={{
        tabs: tab,
        collapsible: false,
        components: CustomSidebarComponents
      }}
      links={[
        {
          type: 'icon',
          icon: <FeishuLogoLight className="block dark:hidden size-5" />,
          url: 'https://oss.laf.run/otnvvf-imgs/fastgpt-feishu1.png',
          text: '飞书群'
        },
        {
          type: 'icon',
          icon: <GithubLogoLight className="block dark:hidden size-5" />,
          url: 'https://github.com/labring/FastGPT',
          text: 'github'
        }
      ]}
    >
      <SidebarKeepOpen tabUrls={tabUrls} />
      <SidebarScrollFix />
      {children}
    </DocsLayout>
  );
}
