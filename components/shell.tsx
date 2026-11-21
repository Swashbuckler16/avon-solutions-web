"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  LayoutDashboard,
  Package,
  Truck,
  RotateCcw,
  ShieldAlert,
  BarChart3,
  Settings2,
  LogOut,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  X,
  CircleHelp,
  ArrowUpRight,
} from "lucide-react";
import { Brand } from "./ui";
import type { User } from "@/lib/auth-core";

const navigation = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/orders", label: "Orders", icon: Package },
  { href: "/dispatch", label: "Dispatch planning", icon: Truck },
  { href: "/customers", label: "Customers", icon: Package },
  { href: "/warehouses", label: "Pickup locations", icon: Truck },
  { href: "/shipments", label: "Shipments", icon: Truck },
  { href: "/returns", label: "Returns", icon: RotateCcw },
  { href: "/pod", label: "Delivery proofs", icon: ShieldAlert },
  { href: "/exceptions", label: "Exceptions", icon: ShieldAlert },
  { href: "/analytics", label: "Analytics & reports", icon: BarChart3 },
  { href: "/automation", label: "Shipping rules", icon: Settings2 },
  { href: "/integrations", label: "Local integrations", icon: Package },
  { href: "/insights", label: "Freight & feedback", icon: BarChart3 },
];
export function Shell({
  user,
  children,
}: {
  user: User;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const sidebar = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const panel = sidebar.current;
    const controls = () =>
      Array.from(
        panel?.querySelectorAll<HTMLElement>("a[href], button") || [],
      ).filter((el) => el.getClientRects().length > 0);
    controls()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
      if (event.key === "Tab") {
        const items = controls();
        const first = items[0],
          last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    const onResize = () => {
      if (window.innerWidth > 850) setMobileOpen(false);
    };
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      previous?.focus();
    };
  }, [mobileOpen]);
  const active =
    navigation.find(
      (n) => pathname === n.href || pathname.startsWith(n.href + "/"),
    )?.label || "Workspace settings";
  return (
    <div
      className={`app-shell ${collapsed ? "is-collapsed" : ""} ${mobileOpen ? "mobile-open" : ""}`}
    >
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      {mobileOpen && (
        <button
          className="sidebar-scrim"
          tabIndex={-1}
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        ref={sidebar}
        className="sidebar"
        role={mobileOpen ? "dialog" : undefined}
        aria-modal={mobileOpen || undefined}
        aria-label="Main navigation"
      >
        <div className="sidebar-brand">
          <Link href="/dashboard" aria-label="Avon overview">
            <Brand light />
          </Link>
          <button
            className="mobile-close icon-button"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          >
            <X size={20} />
          </button>
        </div>
        <div className="workspace-label">
          <span className="workspace-avatar">A</span>
          <div>
            <strong>Avon workspace</strong>
            <small>
              Local environment <span className="live-dot" />
            </small>
          </div>
        </div>
        <p className="nav-section">WORKSPACE</p>
        <nav>
          {navigation.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              aria-current={pathname === href ? "page" : undefined}
              onClick={() => setMobileOpen(false)}
              className={`nav-link ${pathname === href ? "active" : ""}`}
            >
              <Icon size={19} />
              <span>{label}</span>
              {pathname === href && <span className="nav-active-dot" />}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="phase-label">LOCAL SHIPPING WORKSPACE</span>
            <strong>Built for what’s next.</strong>
            <p>
              A simpler workspace.
              <br />A better shipping experience.
            </p>
            <Link href="/settings">
              Workspace details <ArrowUpRight size={14} />
            </Link>
          </div>
          <Link
            href="/settings"
            onClick={() => setMobileOpen(false)}
            className={`nav-link ${pathname.startsWith("/settings") ? "active" : ""}`}
            aria-current={pathname.startsWith("/settings") ? "page" : undefined}
            title="Workspace settings"
          >
            <Settings2 size={19} />
            <span>Workspace settings</span>
          </Link>
          <button
            className="nav-link collapse-button"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? (
              <PanelLeftOpen size={19} />
            ) : (
              <PanelLeftClose size={19} />
            )}
            <span>Collapse menu</span>
          </button>
        </div>
      </aside>
      <div className="app-body">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="mobile-menu icon-button"
              aria-label="Open navigation"
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen(true)}
            >
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{active}</strong>
          </div>
          <div className="topbar-right">
            <span className="environment">
              <span />
              LOCAL WORKSPACE
            </span>
            <Link
              className="icon-button help-link"
              href="/settings"
              aria-label="Workspace information"
            >
              <CircleHelp size={19} />
            </Link>
            <span className="header-divider" />
            <Link href="/settings" className="user-menu">
              <span className="avatar">
                {user.name
                  .split(" ")
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase()}
              </span>
              <span>
                <strong>{user.name}</strong>
                <small>{user.customer_id ? "Customer" : user.role}</small>
              </span>
            </Link>
            <form action="/api/logout" method="post">
              <button
                className="icon-button"
                aria-label="Sign out"
                title="Sign out"
              >
                <LogOut size={18} />
              </button>
            </form>
          </div>
        </header>
        <main id="main" tabIndex={-1}>
          {children}
        </main>
        <footer className="app-footer">
          <span>Avon Solutions & Logistics</span>
          <span>
            Made for smoother operations <span className="footer-dot">•</span>{" "}
            Local preview
          </span>
        </footer>
      </div>
    </div>
  );
}
