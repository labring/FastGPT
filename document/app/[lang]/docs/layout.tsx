import { type ReactNode } from 'react';
import { source } from '@/lib/source';
import { DocsLayout } from 'fumadocs-ui/layouts/notebook';
import { baseOptions } from '@/app/layout.config';
import { t } from '@/lib/i18n';
import LogoLight from '@/components/docs/logo';
import LogoDark from '@/components/docs/logoDark';
import '@/app/global.css';
import { CustomSidebarComponents } from '@/components/sideBar';
import FeishuLogoLight from '@/components/docs/feishuLogoLIght';
import FeishuLogoDark from '@/components/docs/feishuLogoDark';
import GithubLogoLight from '@/components/docs/githubLogoLight';
import GithubLogoDark from '@/components/docs/githubLogoDark';

export default async function Layout({
  params,
  children
}: {
  params: Promise<{ lang: string }>;
  children: ReactNode;
}) {
  const { lang } = await params;

  const tab = [
    {
      title: t('common:introduction', lang),
      url: lang === 'zh-CN' ? '/docs/introduction' : '/en/docs/introduction'
    },
    {
      title: t('common:use-cases', lang),
      url: lang === 'zh-CN' ? '/docs/use-cases' : '/en/docs/use-cases'
    },
    {
      title: t('common:faq', lang),
      url: lang === 'zh-CN' ? '/docs/faq' : '/en/docs/faq'
    },
    {
      title: t('common:protocol', lang),
      url: lang === 'zh-CN' ? '/docs/protocol' : '/en/docs/protocol'
    },
    {
      title: t('common:upgrading', lang),
      url: lang === 'zh-CN' ? '/docs/upgrading' : '/en/docs/upgrading'
    }
  ];

  return (
    <DocsLayout
      {...baseOptions(lang)}
      nav={{
        title: (
          <div className="flex flex-row items-center gap-2 h-14 ml-1">
            <div className="block dark:hidden">
              <LogoLight className="w-48 h-auto" />
            </div>
            <div className="hidden dark:block">
              <LogoDark className="w-48 h-auto" />
            </div>
          </div>
        ),
        mode: 'top'
      }}
      links={[
        {
          type: 'icon',
          icon: (
            <div className="flex flex-row items-center gap-2">
              <div className="block dark:hidden">
                <FeishuLogoLight />
              </div>
              <div className="hidden dark:block">
                <FeishuLogoDark />
              </div>
            </div>
          ),
          url: 'https://oss.laf.run/otnvvf-imgs/fastgpt-feishu1.png',
          text: '飞书群'
        },
        {
          type: 'icon',
          icon: (
            <div className="flex flex-row items-center gap-2">
              <div className="block dark:hidden">
                <GithubLogoLight />
              </div>
              <div className="hidden dark:block">
                <GithubLogoDark />
              </div>
            </div>
          ),
          url: 'https://github.com/labring/FastGPT',
          text: 'github'
        }
      ]}
      tree={source.pageTree[lang]}
      searchToggle={{
        enabled: true
      }}
      sidebar={{
        tabs: tab,
        collapsible: false,
        components: CustomSidebarComponents
      }}
      tabMode="navbar"
    >
      {children}
    </DocsLayout>
  );
}
