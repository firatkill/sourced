import { notFound } from 'next/navigation';
import { AccessForm } from '@/components/access/AccessForm';
import { ACCESS_COPY } from '@/lib/copy';
import { getKitConfig } from '@/lib/kit/runtime-config';
export const metadata = { title: ACCESS_COPY.title };
export default function AccessPage() {
  if (getKitConfig().profile !== 'private') notFound();
  return (
    <section className="mx-auto max-w-2xl py-12">
      <h1 className="text-3xl font-semibold">{ACCESS_COPY.heading}</h1>
      <p className="mt-4">{ACCESS_COPY.body}</p>
      <AccessForm />
    </section>
  );
}
