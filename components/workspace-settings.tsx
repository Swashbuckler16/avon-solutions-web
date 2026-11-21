"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { workspace } from "@/lib/workspace";
export function WorkspaceSettings({
  settings,
  admin,
}: {
  settings: ReturnType<typeof workspace>;
  admin: boolean;
}) {
  const router = useRouter(),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function save(
    e: React.FormEvent<HTMLFormElement>,
    kind: string,
    revision: number,
  ) {
    e.preventDefault();
    if (busy) return;
    const values = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    try {
      const r = await fetch("/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, kind, revision }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setMessage(data.message);
      router.refresh();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card op-panel workspace-preferences">
      <h2>Branding & display</h2>
      <form
        key={`p${settings.preferences.revision}`}
        onSubmit={(e) => save(e, "preferences", settings.preferences.revision)}
      >
        <fieldset disabled={busy} className="op-fields">
          <label className="op-field">
            Theme
            <select name="theme" defaultValue={settings.preferences.theme}>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="system">Follow device</option>
            </select>
          </label>
          <label className="op-field">
            Table density
            <select name="density" defaultValue={settings.preferences.density}>
              <option value="comfortable">Comfortable</option>
              <option value="compact">Compact</option>
            </select>
          </label>
          <button className="button">Save my preferences</button>
        </fieldset>
      </form>
      {admin && (
        <form
          key={`b${settings.brand.revision}`}
          onSubmit={(e) => save(e, "brand", settings.brand.revision)}
        >
          <fieldset disabled={busy} className="op-fields">
            <label className="op-field">
              Company display name
              <input
                name="name"
                maxLength={80}
                required
                defaultValue={settings.brand.name}
              />
            </label>
            <label className="op-field">
              Brand initials
              <input
                name="initials"
                maxLength={3}
                required
                defaultValue={settings.brand.initials}
              />
            </label>
            <label className="op-field">
              Accent palette
              <select name="accent" defaultValue={settings.brand.accent}>
                <option value="teal">Teal</option>
                <option value="blue">Blue</option>
                <option value="violet">Violet</option>
              </select>
            </label>
            <button className="button">Save company branding</button>
          </fieldset>
        </form>
      )}
      <p>
        Display preferences belong to your account. Company branding applies to
        every workspace user.
      </p>
      <p role="status">{busy ? "Saving…" : message}</p>
    </section>
  );
}
