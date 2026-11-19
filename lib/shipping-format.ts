export const trackingStatuses = [
  "info_received",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "exception",
  "rto",
] as const;
export type TrackingStatus = (typeof trackingStatuses)[number];
export const simulatorCarriers = ["Blue Dart", "DTDC", "Delhivery"] as const;
export const formatINR = (paise: number) =>
  (paise / 100).toLocaleString("en-IN", { style: "currency", currency: "INR" });
export const simulationNotice =
  "LOCAL SIMULATOR — no real carrier booking, charge or pickup. Rates, tracking and labels are test data.";
