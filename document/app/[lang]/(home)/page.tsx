import { permanentRedirect } from 'next/navigation';
import { defaultHomePath, getLocalizedPath } from '@/lib/i18n';

export default async function HomePage({
  params
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  permanentRedirect(getLocalizedPath(defaultHomePath, lang));
}
