'use client';

import { RootProvider } from 'fumadocs-ui/provider';
import type { Translations } from 'fumadocs-ui/i18n';
import type { ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import CustomSearchDialog from '@/components/CustomSearchDialog';
import { getLocalizedPath, i18n } from '@/lib/i18n';

/**
 * RootProvider with a domain-aware language switcher: the domain's default locale is
 * unprefixed, the other locale is prefixed (see lib/site.ts).
 */
export default function DocsRootProvider({
  lang,
  locales,
  translations,
  children
}: {
  lang: string;
  locales: { name: string; locale: string }[];
  translations: Partial<Translations>;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const onLocaleChange = (next: string) => {
    const segments = pathname.split('/').filter(Boolean);
    if (segments[0] && i18n.languages.includes(segments[0])) segments.shift();
    const target = getLocalizedPath(`/${segments.join('/')}`, next);
    router.push(target);
    router.refresh();
  };

  return (
    <RootProvider
      i18n={{ locale: lang, locales, translations, onLocaleChange }}
      search={{ enabled: true, SearchDialog: CustomSearchDialog }}
      theme={{ enabled: true }}
    >
      {children}
    </RootProvider>
  );
}
