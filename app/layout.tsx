import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  const metadataBase = new URL(`${protocol}://${host}`);
  const title = "한판 — 같이 노는 술게임";
  const description = "방을 만들고 바로 시작하는 모바일 술게임";

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
      images: [{ url: "/og-gem-heist.png", width: 1536, height: 1024, alt: "한판 사라진 보석 추리게임" }],
    },
    twitter: { card: "summary_large_image", title, description, images: ["/og-gem-heist.png"] },
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
