import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Check, Layers3 } from "lucide-react";
import { PageHeading } from "@/components/ui";

const modules: Record<
  string,
  { title: string; stage: number; description: string; features: string[] }
> = {
  orders: {
    title: "Orders",
    stage: 2,
    description:
      "A better home for every order, from first entry to fulfillment.",
    features: [
      "Create and manage orders",
      "Import spreadsheets with clear validation",
      "Filter, search and organize your worklist",
      "Manage warehouses, items and package details",
    ],
  },
  shipments: {
    title: "Shipments",
    stage: 3,
    description: "Follow every movement, from pickup to proof of delivery.",
    features: [
      "Create shipments and choose a carrier service",
      "Generate labels and follow tracking events",
      "Handle cancellations safely",
      "Review proof of delivery",
    ],
  },
  returns: {
    title: "Returns",
    stage: 3,
    description: "Bring reverse logistics into the same clear workflow.",
    features: [
      "Create reverse shipments",
      "Track return progress",
      "Record return quality checks",
      "Keep a complete activity history",
    ],
  },
  exceptions: {
    title: "Exceptions",
    stage: 4,
    description: "Turn delivery problems into clear next steps.",
    features: [
      "Manage non-delivery and pickup exceptions",
      "Request action with a reason and history",
      "Work through bulk updates",
      "Follow each case through resolution",
    ],
  },
  analytics: {
    title: "Analytics & reports",
    stage: 4,
    description:
      "Understand what is moving, what is improving, and what needs attention.",
    features: [
      "Compare delivery and carrier performance",
      "Create filtered exports",
      "Save and schedule reports",
      "Reconcile metrics with source records",
    ],
  },
};
export default async function Module({
  params,
}: {
  params: Promise<{ module: string }>;
}) {
  const { module } = await params;
  const spec = Object.hasOwn(modules, module) ? modules[module] : undefined;
  if (!spec) notFound();
  return (
    <>
      <PageHeading
        eyebrow="WORKSPACE ROADMAP"
        title={spec.title}
        description={spec.description}
      />
      <section className="module-preview card">
        <div className="module-illustration">
          <Layers3 size={48} strokeWidth={1.3} />
        </div>
        <span className="phase-tag">PLANNED FOR STAGE {spec.stage}</span>
        <h2>
          A foundation first.
          <br />A smoother workflow next.
        </h2>
        <p className="muted">
          This module is not active yet. Stage 1 establishes your secure
          workspace;
          <br className="desktop-only" /> the next stages bring these operations
          to life.
        </p>
        <ul>
          {spec.features.map((f) => (
            <li key={f}>
              <Check size={17} />
              {f}
            </li>
          ))}
        </ul>
        <Link href="/dashboard" className="button">
          <ArrowLeft size={16} />
          Return to overview
        </Link>
        <Link className="text-link" href="/settings">
          Explore workspace settings <ArrowUpRight size={15} />
        </Link>
      </section>
    </>
  );
}
