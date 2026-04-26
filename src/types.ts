export type Op =
  | { kind: "rotate"; deg: 90 | 180 | 270 }
  | { kind: "flip"; axis: "h" | "v" }
  | { kind: "crop"; x: number; y: number; w: number; h: number }
  | { kind: "resize"; width: number; height: number }
  | { kind: "filter"; name: FilterName; amount: number };

export type FilterName =
  | "grayscale"
  | "sepia"
  | "invert"
  | "brightness"
  | "contrast"
  | "saturation"
  | "blur";

export const SUPPORTED_OUTPUT = ["png", "jpeg", "webp", "bmp", "tiff", "ico"] as const;
export type OutputFormat = typeof SUPPORTED_OUTPUT[number];

export function normalizeFormat(ext: string): OutputFormat {
  const e = ext.toLowerCase().replace(/^\./, "");
  if (e === "jpg") return "jpeg";
  if (e === "tif") return "tiff";
  if (SUPPORTED_OUTPUT.includes(e as OutputFormat)) return e as OutputFormat;
  return "png";
}
