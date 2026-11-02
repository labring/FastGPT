import { type ReactNode } from 'react';
import { source } from '@/lib/source';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { LargeSearchToggle } from 'fumadocs-ui/components/layout/search-toggle';
import { ThemeToggle } from 'fumadocs-ui/components/layout/theme-toggle';
import { baseOptions } from '@/app/layout.config';
import { getLocalizedPath, i18n, t } from '@/lib/i18n';
import '@/app/global.css';
import { CustomSidebarComponents } from '@/components/sideBar';
import { SidebarScrollFix } from '@/components/sidebarScrollFix';
import { CategorySwitcher } from '@/components/docs/categorySwitcher';
import { MobileNav } from '@/components/docs/mobileNav';
import { LanguageSwitcher } from '@/components/docs/languageSwitcher';
import { BookOpen, Code, Handshake, History, Server } from 'lucide-react';

export default async function Layout({
  params,
  children
}: {
  params: Promise<{ lang: string }>;
  children: ReactNode;
}) {
  const { lang } = await params;

  const tree = source.pageTree[lang] ?? source.pageTree[i18n.defaultLanguage];
  // Section membership follows the navigation tree, including cross-directory pages.
  const sectionUrls = tree.children.map((section) => {
    const urls = new Set<string>();
    const visit = (node: (typeof tree.children)[number]) => {
      if (node.type === 'page') urls.add(node.url);
      if (node.type === 'folder') {
        if (node.index) urls.add(node.index.url);
        node.children.forEach(visit);
      }
    };
    visit(section);
    return urls;
  });

  const iconClass = 'size-4';
  const tab = [
    {
      icon: <BookOpen className={iconClass} />,
      title: lang === 'en' ? 'Use FastGPT' : '使用 FastGPT',
      url: getLocalizedPath('/guide/getting-started', lang),
      urls: sectionUrls[0]
    },
    {
      icon: <Code className={iconClass} />,
      title: lang === 'en' ? 'Developers' : '开发者',
      url: getLocalizedPath('/developers', lang),
      urls: sectionUrls[1]
    },
    {
      icon: <Server className={iconClass} />,
      title: lang === 'en' ? 'Deploy and Operate' : '部署与运维',
      url: getLocalizedPath('/self-host', lang),
      urls: sectionUrls[2]
    },
    {
      icon: <History className={iconClass} />,
      title: lang === 'en' ? 'Versions & Upgrades' : '版本与升级',
      url: getLocalizedPath('/self-host/upgrading/version-timeline', lang),
      urls: sectionUrls[3]
    },
    {
      icon: <Handshake className={iconClass} />,
      title: t('common:businessConsultation', lang),
      url: `https://fastgpt.cn/${lang === 'en' ? 'en' : 'zh'}/contact/embed?source=docs&utm_source=docs&utm_medium=referral&utm_campaign=docs_navigation&utm_content=business_consultation`,
      dialog: {
        url: `https://fastgpt.cn/${lang === 'en' ? 'en' : 'zh'}/contact/embed?source=docs&utm_source=docs&utm_medium=referral&utm_campaign=docs_navigation&utm_content=business_consultation`,
        title: lang === 'en' ? 'Contact FastGPT' : '联系 FastGPT',
        description:
          lang === 'en'
            ? "We'll get in touch with you within 1–3 business days."
            : '我们将在 1～3 个工作日内与您取得联系',
        closeLabel: lang === 'en' ? 'Close contact dialog' : '关闭咨询窗口'
      }
    }
  ];


  const base = baseOptions(lang);

  return (
    <DocsLayout
      {...base}
      tree={tree}
      nav={{ ...base.nav, component: <MobileNav lang={lang} title={base.nav?.title} /> }}
      containerProps={{ className: "[--fd-nav-height:56px] md:[--fd-nav-height:0px]" }}
      i18n={false}
      searchToggle={{
        enabled: true,
        components: {
          lg: <LargeSearchToggle hideIfDisabled className="max-md:hidden rounded-xl px-2" />
        }
      }}
      themeSwitch={{
        ...base.themeSwitch,
        enabled: false
      }}
      sidebar={{
        tabs: false,
        collapsible: false,
        components: CustomSidebarComponents,
        banner: (
          <section>
            <CategorySwitcher
              options={tab}
              className="h-[40px] rounded-xl border bg-fd-secondary/50 px-2 py-1.5 text-sm text-fd-foreground/80 hover:bg-fd-accent hover:text-fd-foreground data-[open=true]:bg-fd-accent data-[open=true]:text-fd-foreground"
            />
          </section>
        ),
        footer: (
          <section className="flex w-full items-center justify-between">
            <ThemeToggle
              className="h-8 p-0 [&_svg]:size-8 [&_svg]:p-2"
              mode={base.themeSwitch?.mode}
              aria-label={lang === 'en' ? 'Toggle theme' : '切换主题'}
            />
            <LanguageSwitcher
              buttonClassName="h-8 max-w-none rounded-xl border bg-white px-2 text-sm text-fd-foreground/80 hover:bg-fd-accent hover:text-fd-foreground data-[open=true]:bg-fd-accent data-[open=true]:text-fd-foreground dark:bg-fd-background"
              menuClassName="min-w-[9.5rem]"
            />
          </section>
        )
      }}
      links={[]}
    >
      <SidebarScrollFix />
      {children}
    </DocsLayout>
  );
}
