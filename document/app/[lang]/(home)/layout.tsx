import type { ReactNode } from 'react';
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import LogoLight from '@/components/docs/logo';

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
      nav={{
        title: (
          <div className="flex flex-row items-center gap-2 h-14">
            <LogoLight />
          </div>
        )
      }}
      i18n
    >
      {children}
    </HomeLayout>
  );
}
