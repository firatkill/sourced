import Link from 'next/link';

export default function NotFound() {
  return (
    <>
      <h1>Page not found</h1>
      <p>There is nothing at this address.</p>
      <p>
        <Link href="/">Go to the ask page</Link>
      </p>
    </>
  );
}
