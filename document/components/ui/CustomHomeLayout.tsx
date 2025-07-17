import { type HTMLAttributes } from 'react';
import { HomeLayout, type HomeLayoutProps } from 'fumadocs-ui/layouts/home';
import Link from 'next/link';

interface CustomHomeLayoutProps extends HomeLayoutProps {
  // 可以在这里添加自定义的属性
}

export function CustomHomeLayout({
  children,
  nav,
  ...props
}: CustomHomeLayoutProps & HTMLAttributes<HTMLElement>) {
  return (
    <HomeLayout
      {...props}
      nav={{
        ...nav,
        title: (
          <div className="flex flex-col items-center gap-2">
            <div className="flex flex-row items-center gap-2">
              <img src="/logo.svg" alt="FastGPT" width={49} height={48} />
              FastGPT
            </div>
            <div className="flex flex-row items-center gap-4 text-sm">
              <Link href="/docs/introduction" className="hover:text-blue-500">
                使用说明
              </Link>
              <Link href="/docs/use-cases" className="hover:text-blue-500">
                使用案例
              </Link>
              <Link href="/docs/agreement" className="hover:text-blue-500">
                协议
              </Link>
              <Link href="/docs/api" className="hover:text-blue-500">
                API手册
              </Link>
            </div>
          </div>
        ),
        transparentMode: 'none'
      }}
    >
      {children}
    </HomeLayout>
  );
}
