import type { DatabaseSync } from "node:sqlite";
import type { User } from "./auth-core.ts";
import { InputError, record, text, transaction } from "./orders.ts";
export function workspace(db: DatabaseSync, user: User) {
  return {
    brand: {
      ...db
        .prepare(
          "SELECT name,initials,accent,revision FROM workspace_brand WHERE id=1",
        )
        .get(),
    } as {
      name: string;
      initials: string;
      accent: string;
      revision: number;
    },
    preferences: {
      ...(db
        .prepare(
          "SELECT theme,density,revision FROM user_preferences WHERE user_id=?",
        )
        .get(user.id) || {
        theme: "light",
        density: "comfortable",
        revision: 0,
      }),
    } as { theme: string; density: string; revision: number },
  };
}
export function saveWorkspace(db: DatabaseSync, user: User, input: unknown) {
  const v = record(input);
  return transaction(db, () => {
    const old = workspace(db, user);
    if (v.kind === "brand") {
      if (user.role !== "admin" || user.customer_id)
        throw new InputError("Workspace administrator required.", 403);
      if (Number(v.revision) !== old.brand.revision)
        throw new InputError("Brand changed. Reload.", 409);
      const name = text(v.name, "Company name", 80),
        initials = text(v.initials, "Initials", 3),
        accent = text(v.accent, "Accent");
      if (!["teal", "blue", "violet"].includes(accent))
        throw new InputError("Choose a supported accent.");
      db.prepare(
        "UPDATE workspace_brand SET name=?,initials=?,accent=?,revision=revision+1 WHERE id=1",
      ).run(name, initials, accent);
    } else if (v.kind === "preferences") {
      if (Number(v.revision) !== old.preferences.revision)
        throw new InputError("Preferences changed. Reload.", 409);
      const theme = text(v.theme, "Theme"),
        density = text(v.density, "Density");
      if (
        !["light", "dark", "system"].includes(theme) ||
        !["comfortable", "compact"].includes(density)
      )
        throw new InputError("Invalid display preference.");
      db.prepare(
        "INSERT INTO user_preferences(user_id,theme,density) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET theme=excluded.theme,density=excluded.density,revision=user_preferences.revision+1",
      ).run(user.id, theme, density);
    } else throw new InputError("Unknown settings action.");
    db.prepare(
      "INSERT INTO audit_events(user_id,action,created_at) VALUES(?,?,?)",
    ).run(user.id, `workspace_${v.kind}_saved`, Date.now());
    return { message: "Workspace settings saved." };
  });
}
