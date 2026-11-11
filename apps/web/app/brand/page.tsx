import { landingMetadata } from "@/lib/site-meta";

export const metadata = { title: "Brand", ...landingMetadata() };

// WO-34b §4: the existing artwork (packages/ui/logo, copied to public/brand). No new artwork.
const FILES = [
  { file: "mark.svg", name: "Mark", kind: "SVG", w: 96, h: 96, alt: "The Nectar mark: three mint hexagons" },
  { file: "mark-256.png", name: "Mark", kind: "PNG 256 px", w: 96, h: 96, alt: "The Nectar mark, raster" },
  { file: "mark-flat-96.png", name: "Mark, flat", kind: "PNG 96 px", w: 96, h: 96, alt: "The Nectar mark, flat colours" },
  { file: "wordmark-dark-100.png", name: "Wordmark, dark ink", kind: "PNG", w: 240, h: 48, alt: "Nectar wordmark in dark ink" },
  { file: "wordmark-muted-100.png", name: "Wordmark, muted", kind: "PNG", w: 240, h: 48, alt: "Nectar wordmark in muted ink" },
] as const;

export default function BrandPage() {
  return (
    <div className="page wrap">
      <div className="page-head">
        <span className="label">Brand</span>
        <h1>Brand assets</h1>
        <p className="lead">Use the mark and wordmark as supplied, unaltered and with clear space around them, when you refer to Nectar Labs.</p>
      </div>
      <ul className="grid-3" role="list" data-testid="brand-files">
        {FILES.map((f) => (
          <li key={f.file} className="card stack">
            <div className="brand-tile">
              <img src={`/brand/${f.file}`} alt={f.alt} width={f.w} height={f.h} style={{ maxWidth: "100%", height: "auto", objectFit: "contain" }} />
            </div>
            <strong>{f.name}</strong>
            <span className="caption">{f.kind}</span>
            <a className="link" href={`/brand/${f.file}`} download aria-label={`Download ${f.name} (${f.kind})`}>
              Download
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
