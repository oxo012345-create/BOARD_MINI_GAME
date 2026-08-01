import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  const metadataBase = new URL(`${protocol}://${host}`);
  const title = "한판 — 같이 노는 술게임";
  const description = "각자 휴대폰으로 접속해 같은 자리에서 말하고 웃는 모바일 술게임 — Blender 아이템 카드로 즐기는 수상한 딜러들";

  return {
    metadataBase,
    title,
    description,
    applicationName: "한판",
    appleWebApp: { capable: true, title: "한판", statusBarStyle: "black-translucent" },
    openGraph: {
      type: "website",
      locale: "ko_KR",
      title,
      description,
      images: [{ url: "/og.png", width: 1672, height: 941, alt: "한판 수상한 딜러들 2D 카드 경매 게임" }],
    },
    twitter: { card: "summary_large_image", title, description, images: ["/og.png"] },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        <meta name="theme-color" content="#0d0f12" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </head>
      <body>{children}</body>
    </html>
  );
}
