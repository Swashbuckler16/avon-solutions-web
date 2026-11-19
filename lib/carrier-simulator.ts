import { simulatorCarriers } from "./shipping-format.ts";
import type { Address, Parcel } from "./orders.ts";

// Deliberately fictional service rules. Replace this boundary with a documented
// provider adapter; never treat these calculations as a Blue Dart rate card.
export function simulatedServices(
  pickup: Address,
  recipient: Address,
  packages: Parcel[],
) {
  // Validated inputs have at most three decimals. Use exact integer units
  // (1 / 5e12 kg) for both actual and volumetric weight before rounding.
  const milli = (value: string) => BigInt(Math.round(Number(value) * 1000));
  const units = packages.reduce((sum, p) => {
    const actual = milli(p.weight) * 5_000_000_000n;
    const volume = milli(p.length) * milli(p.width) * milli(p.height);
    return sum + (actual > volume ? actual : volume);
  }, 0n);
  const halfKilo = 2_500_000_000_000n;
  const kg = Number((units + halfKilo - 1n) / halfKilo) / 2;
  const unavailable =
    recipient.pincode === "999999" || pickup.pincode === "999999" || kg > 100;
  return simulatorCarriers.flatMap((carrier, index) =>
    ["Surface", "Express"].map((name, serviceIndex) => ({
      carrier,
      service: `Simulated ${name}`,
      chargeable_kg: kg,
      eta_days: serviceIndex ? 2 : 4,
      price_paise: Math.round(
        (4500 + index * 500 + kg * 1600) * (serviceIndex ? 1.6 : 1),
      ),
      available: !unavailable,
      reason: unavailable
        ? "Simulator limit: PIN 999999 or chargeable weight above 100 kg."
        : "Fictional domestic test service",
    })),
  );
}
