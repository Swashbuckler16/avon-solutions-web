"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="standalone-state" role="alert">
      <h1>Something didn’t load.</h1>
      <p>Your saved data is unchanged. Try loading this view again.</p>
      <button className="button" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
