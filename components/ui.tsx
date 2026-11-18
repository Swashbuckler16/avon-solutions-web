import { ArrowUpRight, PackageCheck } from "lucide-react";

export function Brand({ light = false }: { light?: boolean }) {
  return (
    <div className={`brand ${light ? "brand-light" : ""}`}>
      <span className="brand-symbol">
        <PackageCheck size={23} />
      </span>
      <span>
        avon<span className="brand-dot">.</span>
        <small>SOLUTIONS & LOGISTICS</small>
      </span>
    </div>
  );
}
export function Badge({ status }: { status: string }) {
  const label = status.replaceAll("_", " ");
  return (
    <span className={`badge badge-${status}`}>
      <span className="badge-dot" />
      {label}
    </span>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="muted">{description}</p>
      </div>
      <div className="heading-actions">{children}</div>
    </div>
  );
}
export function Metric({
  label,
  value,
  note,
  icon,
  accent = false,
}: {
  label: string;
  value: number | string;
  note: string;
  icon: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <article className={`metric ${accent ? "metric-accent" : ""}`}>
      <div className="metric-top">
        <span>{label}</span>
        <span className="metric-icon">{icon}</span>
      </div>
      <strong>{value}</strong>
      <div className="metric-note">
        <ArrowUpRight size={14} />
        {note}
      </div>
    </article>
  );
}
