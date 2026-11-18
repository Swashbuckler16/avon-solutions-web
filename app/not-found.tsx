import Link from "next/link";
export default function NotFound() {
  return (
    <main className="standalone-state">
      <h1>That page isn’t here.</h1>
      <p>Let’s get you back to your workspace.</p>
      <Link className="button" href="/dashboard">
        Back to overview
      </Link>
    </main>
  );
}
