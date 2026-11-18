import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Avon | Operations workspace",
  description:
    "A clearer way to manage your shipping operations. Local development workspace.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
