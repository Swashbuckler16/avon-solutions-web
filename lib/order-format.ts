export const carriers = [
  "No preference",
  "Blue Dart",
  "DTDC",
  "Delhivery",
] as const;
export const importFields = [
  "reference",
  "recipient_name",
  "phone",
  "address",
  "city",
  "state",
  "pincode",
  "product",
  "sku",
  "hsn",
  "quantity",
  "price",
  "weight",
  "length",
  "width",
  "height",
  "invoice_number",
  "invoice_date",
  "payment_mode",
  "carrier",
] as const;
export function csv(rows: unknown[][]) {
  return (
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map((value) => {
            let s = String(value ?? "");
            if (/^[\s]*[=+@-]/.test(s)) s = "'" + s;
            return '"' + s.replaceAll('"', '""') + '"';
          })
          .join(","),
      )
      .join("\r\n")
  );
}
export function businessDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
