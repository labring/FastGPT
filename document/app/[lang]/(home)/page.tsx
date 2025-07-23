import { redirect } from 'next/navigation';

export default function HomePage({ params }: { params: { lang: string } }) {
  redirect(`/${params.lang}/docs/introduction`);
}
