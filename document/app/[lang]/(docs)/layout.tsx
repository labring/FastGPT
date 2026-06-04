import { type ReactNode } from 'react';
import { source } from '@/lib/source';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { LargeSearchToggle } from 'fumadocs-ui/components/layout/search-toggle';
import { ThemeToggle } from 'fumadocs-ui/components/layout/theme-toggle';
import { baseOptions } from '@/app/layout.config';
import { t, getLocalizedPath, i18n } from '@/lib/i18n';
import '@/app/global.css';
import { CustomSidebarComponents } from '@/components/sideBar';
import { SidebarKeepOpen } from '@/components/sidebarKeepOpen';
import { SidebarScrollFix } from '@/components/sidebarScrollFix';
import { CategorySwitcher } from '@/components/docs/categorySwitcher';
import { LanguageSwitcher } from '@/components/docs/languageSwitcher';
import { normalizePageTreeSections } from '@/lib/page-tree';
import { BookOpen, Code, Handshake, Plug, Server } from 'lucide-react';

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
      title: t('common:guide', lang),
      url: getLocalizedPath('/guide', lang)
    },
    {
      icon: <Plug className={iconClass} />,
      title: t('common:pluginSystem', lang),
      url: getLocalizedPath('/plugin', lang)
    },
    {
      icon: <Server className={iconClass} />,
      title: t('common:selfHost', lang),
      url: getLocalizedPath('/self-host', lang)
    },
    {
      icon: <Code className={iconClass} />,
      title: t('common:api_reference', lang),
      url: getLocalizedPath('/openapi', lang)
    },
    {
      icon: <Handshake className={iconClass} />,
      title: t('common:businessConsultation', lang),
      url: 'https://fael3z0zfze.feishu.cn/share/base/form/shrcnjJWtKqjOI9NbQTzhNyzljc'
    }
  ];

  const tabUrls = tab.map((t) => t.url);

  const base = baseOptions(lang);
  const tree = normalizePageTreeSections(
    source.pageTree[lang] || source.pageTree[i18n.defaultLanguage]
  );

  return (
    <DocsLayout
      {...base}
      tree={tree}
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
      <SidebarKeepOpen tabUrls={tabUrls} />
      <SidebarScrollFix />
      {children}
    </DocsLayout>
  );
}
