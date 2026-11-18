import { redirect } from "next/navigation";
import {
  ArrowRight,
  Check,
  ShieldCheck,
  Route,
  PackageCheck,
} from "lucide-react";
import { currentUser } from "@/lib/auth";
import { Brand } from "@/components/ui";

export const dynamic = "force-dynamic";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await currentUser()) redirect("/dashboard");
  const { error } = await searchParams;
  return (
    <main className="login-page">
      <section className="login-story">
        <Brand light />
        <div className="login-story-body">
          <span className="login-kicker">YOUR OPERATIONS. CONNECTED.</span>
          <h1>
            Less friction.
            <br />
            More forward.
          </h1>
          <p>
            One thoughtful workspace for the people
            <br className="desktop-only" /> keeping your shipments moving.
          </p>
          <div className="route-art" aria-hidden="true">
            <span className="route-node">
              <PackageCheck size={28} />
            </span>
            <span className="route-line" />
            <span className="route-node route-node-middle">
              <Route size={28} />
            </span>
            <span className="route-line" />
            <span className="route-node route-node-end">
              <Check size={28} />
            </span>
          </div>
          <div className="route-labels" aria-hidden="true">
            <span>Organize</span>
            <span>Move</span>
            <span>Deliver</span>
          </div>
        </div>
        <div className="login-story-footer">
          PURPOSE-BUILT FOR AVON <span>01 — FOUNDATION</span>
        </div>
      </section>
      <section className="login-form-side">
        <div className="login-environment">
          <span className="live-dot" /> LOCAL WORKSPACE
        </div>
        <div className="login-form-wrap">
          <span className="eyebrow">WELCOME TO AVON</span>
          <h2>Let’s get you signed in.</h2>
          <p className="muted">Your workspace, ready when you are.</p>
          {error && (
            <div className="alert alert-error" role="alert">
              {error === "limited"
                ? "Too many sign-in attempts. Try again in 15 minutes."
                : "We couldn’t sign you in. Check your email and password."}
            </div>
          )}
          <form action="/api/login" method="post" className="login-form">
            <label htmlFor="email">Work email</label>
            <input
              id="email"
              name="email"
              type="email"
              placeholder="you@avon.local"
              autoComplete="username"
              required
              maxLength={254}
            />
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              placeholder="Enter your password"
              autoComplete="current-password"
              required
              maxLength={256}
            />
            <button className="button login-submit">
              Sign in to workspace <ArrowRight size={18} />
            </button>
          </form>
          <p className="login-help">
            <ShieldCheck size={17} /> Access is limited to your local workspace
            accounts.
          </p>
          <div className="login-setup">
            <strong>First time here?</strong>
            <p>
              Ask your workspace administrator for the account details generated
              during local setup.
            </p>
          </div>
        </div>
        <p className="login-copyright">
          Avon Solutions & Logistics <span>Designed to keep you moving.</span>
        </p>
      </section>
    </main>
  );
}
