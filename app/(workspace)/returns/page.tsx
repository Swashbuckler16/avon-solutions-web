import { ShipmentWorklist } from "@/components/shipment-worklist";
export default async function Returns({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <ShipmentWorklist params={await searchParams} direction="reverse" />;
}
