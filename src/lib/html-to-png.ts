import { toPng } from "html-to-image";

/** Turn a full HTML receipt into a PNG (renderer). Used when Electron preload has no receiptImage yet. */
export async function htmlToPngBase64(html: string, width: number): Promise<string> {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = `position:fixed;left:-12000px;top:0;width:${width}px;height:800px;border:0;background:#fff;opacity:0;pointer-events:none;`;
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  if (!doc) {
    iframe.remove();
    throw new Error("Could not open receipt");
  }
  doc.open();
  doc.write(html);
  doc.close();

  await new Promise((r) => setTimeout(r, 80));
  await Promise.all(
    [...doc.images].map((img) => (img.complete ? Promise.resolve() : img.decode().catch(() => undefined)))
  );

  const node = doc.body;
  const height = Math.min(Math.max(node.scrollHeight || doc.documentElement.scrollHeight || 400, 200), 14000);
  iframe.style.height = `${height}px`;
  await new Promise((r) => setTimeout(r, 40));

  try {
    const dataUrl = await toPng(node, {
      width,
      height,
      pixelRatio: 2,
      backgroundColor: "#ffffff",
      cacheBust: false,
    });
    return dataUrl.replace(/^data:image\/png;base64,/, "");
  } finally {
    iframe.remove();
  }
}

export function pngBase64ToBlob(base64: string): Blob {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: "image/png" });
}
