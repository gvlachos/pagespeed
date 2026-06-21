import * as fs from "fs";
import * as path from "path";

export function deriveFilename(
  targetUrl: string,
  strategy: string,
  runs: number,
): string {
  const slug = targetUrl
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9._-]/gi, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  return `pagespeed_${slug}_${strategy}_${runs}runs.md`;
}

export function saveReport(
  content: string,
  filename: string,
  outputDir = ".",
): string {
  fs.mkdirSync(outputDir, { recursive: true });
  const filePath = path.join(outputDir, filename);
  fs.writeFileSync(filePath, content, "utf-8");
  return filePath;
}
