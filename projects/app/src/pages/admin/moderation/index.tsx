import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function ModerationIndex() {
  const router = useRouter();
  useEffect(() => {
    void router.replace('/admin/moderation/policy');
  }, [router]);
  return null;
}
