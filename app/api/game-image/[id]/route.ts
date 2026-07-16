import { getVerifiedImage } from "../../_lib/images";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const image = getVerifiedImage(id.replace(/[^a-z0-9]/gi, "").slice(0, 8));
  if (!image) return new Response("Not found", { status: 404 });

  try {
    const upstream = await fetch(image.url, { headers: { "User-Agent": "HanpanGame/1.0" } });
    if (!upstream.ok || !upstream.body) return new Response("Image unavailable", { status: 502 });
    return new Response(upstream.body, {
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "image/jpeg",
        "Cache-Control": "public, max-age=86400, s-maxage=604800",
        "X-Image-Source": encodeURIComponent(image.source),
      },
    });
  } catch {
    return new Response("Image unavailable", { status: 502 });
  }
}
