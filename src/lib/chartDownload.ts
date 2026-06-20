import html2canvas from "html2canvas";
import { BRAND_ASSETS } from "./brandAssets";

let brandMarkPromise: Promise<HTMLImageElement> | null = null;

function loadBrandMark(): Promise<HTMLImageElement> {
  if (!brandMarkPromise) {
    brandMarkPromise = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Brand mark failed to load"));
      img.src = BRAND_ASSETS.brandMark;
    });
  }
  return brandMarkPromise;
}

function applyBrandWatermark(canvas: HTMLCanvasElement, logo: HTMLImageElement): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const logoHeight = Math.max(18, Math.round(canvas.height * 0.042));
  const logoWidth = (logo.naturalWidth / logo.naturalHeight) * logoHeight;
  const padding = Math.max(10, Math.round(canvas.width * 0.014));
  const x = canvas.width - logoWidth - padding;
  const y = canvas.height - logoHeight - padding;
  const backdropPad = 5;

  ctx.save();
  ctx.fillStyle = "rgba(10, 11, 18, 0.88)";
  ctx.beginPath();
  ctx.roundRect(
    x - backdropPad,
    y - backdropPad,
    logoWidth + backdropPad * 2,
    logoHeight + backdropPad * 2,
    7
  );
  ctx.fill();
  ctx.drawImage(logo, x, y, logoWidth, logoHeight);
  ctx.restore();
}

export function chartDownloadFilename(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `lighterllama-${slug || "chart"}.png`;
}

export async function captureElementPng(element: HTMLElement): Promise<string> {
  const logo = await loadBrandMark();
  const canvas = await html2canvas(element, {
    backgroundColor: "#0a0b12",
    scale: 2,
    logging: false,
    useCORS: true,
  });
  applyBrandWatermark(canvas, logo);
  return canvas.toDataURL("image/png");
}

export async function downloadElementPng(element: HTMLElement, filename: string): Promise<void> {
  const dataUrl = await captureElementPng(element);
  const link = document.createElement("a");
  link.download = filename.endsWith(".png") ? filename : `${filename}.png`;
  link.href = dataUrl;
  link.click();
}