import { useState, type MouseEvent, type RefObject } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { downloadElementPng } from "../lib/chartDownload";

type ChartDownloadButtonProps = {
  targetRef: RefObject<HTMLElement | null>;
  filename: string;
  className?: string;
  label?: string;
};

export function ChartDownloadButton({
  targetRef,
  filename,
  className = "",
  label = "Download PNG",
}: ChartDownloadButtonProps) {
  const [busy, setBusy] = useState(false);

  const handleClick = async (event: MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    const element = targetRef.current;
    if (!element) {
      toast.error("Nothing to capture");
      return;
    }

    setBusy(true);
    try {
      await downloadElementPng(element, filename);
      toast.success("PNG saved");
    } catch {
      toast.error("Download failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className={`chart-dl-btn ${className}`.trim()}
      title={label}
      aria-label={label}
    >
      <Download className={`chart-dl-btn__icon ${busy ? "animate-pulse" : ""}`} />
    </button>
  );
}