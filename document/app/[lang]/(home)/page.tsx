import { redirect } from 'next/navigation';
import { getLocalizedPath } from '@/lib/i18n';

export default async function HomePage({
  params
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  redirect(getLocalizedPath('/docs/introduction', lang));
}
