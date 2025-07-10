import type { ReactNode } from 'react';
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { baseOptions } from '@/app/layout.config';
import { t } from '@/lib/i18n';

export default async function Layout({
  params,
  children
}: {
  params: Promise<{ lang: string }>;
  children: ReactNode;
}) {
  const lang = (await params).lang;
  return (
    <HomeLayout
      {...baseOptions(lang)}
      links={[
        {
          text: t('common:Documentation'),
          url: '/docs'
        }
      ]}
    >
      {children}
    </HomeLayout>
  );
}
