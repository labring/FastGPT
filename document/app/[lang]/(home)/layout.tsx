import type { ReactNode } from 'react';
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { baseOptions } from '@/app/layout.config';
import { t } from '@/lib/i18n';
import Link from 'next/link';
import {
  NavbarMenu,
  NavbarMenuContent,
  NavbarMenuLink,
  NavbarMenuTrigger
} from 'fumadocs-ui/layouts/home/navbar';
import { Navbar } from 'fumadocs-ui/layouts/docs-client';

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
            <img src="/logo.svg" alt="FastGPT" width={49} height={48} />
            FastGPT
          </div>
        )
      }}
      i18n
    >
      {children}
    </HomeLayout>
  );
}
