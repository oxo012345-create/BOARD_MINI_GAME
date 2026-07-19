import { getVerifiedImage } from "../../_lib/images";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const image = getVerifiedImage(id.replace(/[^a-z0-9]/gi, "").slice(0, 8));
  if (!image) return new Response("Not found", { status: 404 });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const upstream = await fetch(image.url, {
        headers: { "Accept": "image/avif,image/webp,image/*,*/*;q=0.8", "User-Agent": "HanpanGame/1.0 (quiz image proxy)" },
      });
      const contentType = upstream.headers.get("content-type") ?? "";
      if (upstream.ok && upstream.body && contentType.startsWith("image/")) {
        return new Response(upstream.body, {
          headers: {
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400",
            "X-Image-Source": encodeURIComponent(image.source),
          },
        });
      }
      await upstream.body?.cancel();
    } catch {
      // 한 번 더 시도한 뒤 사용자에게 재시도 버튼을 보여 줍니다.
    }
    if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return new Response("Image unavailable", { status: 502, headers: { "Cache-Control": "no-store" } });
}
