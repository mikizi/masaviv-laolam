import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
  const image = `${protocol}://${host}/og.png`;
  return {
    title: "מסביב לעולם | מדריך מדינות לילדים",
    description: "מגלים מדינות, מנהיגים, ערי בירה, מאכלים, מפות והיסטוריה — בשפה פשוטה לילדים.",
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: { title: "מסביב לעולם", description: "מגלים מדינות בסקרנות", images: [{ url: image, width: 1736, height: 907 }] },
    twitter: { card: "summary_large_image", title: "מסביב לעולם", description: "מגלים מדינות בסקרנות", images: [image] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="he" dir="rtl"><body>{children}</body></html>;
}
