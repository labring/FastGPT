import { redirect } from 'next/navigation';

export default function NotFound() {
  redirect(`/docs/introduction`);
  return <></>;
}
