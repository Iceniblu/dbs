// The DBS Consulting building mark (from the brand deck) plus the wordmark.
// tone="light" for navy backgrounds (white mark, as on report covers), "brand" for white backgrounds (navy-to-teal mark).
const MARK =
  "M210.9 131.4C211.2 131.4 211.4 131.5 211.7 131.6L270.1 165.8C271.3 166.5 272.1 167.8 272.1 169.3L272.1 265C272.1 265.8 271.4 266.5 270.6 266.5L211 266.5C210.2 266.5 209.5 265.8 209.5 265L209.5 132.9C209.4 132.1 210.1 131.4 210.9 131.4ZM141.1 39.7C141.4 39.7 141.6 39.8 141.9 39.9L200.3 74.1C201.5 74.8 202.3 76.1 202.3 77.6L202.3 265C202.3 265.8 201.6 266.5 200.8 266.5L141.2 266.5C140.4 266.5 139.7 265.8 139.7 265L139.7 41.2C139.6 40.4 140.3 39.7 141.1 39.7ZM303.9 174.3C304.2 174.3 304.4 174.4 304.7 174.5L364.3 209.4C364.8 209.7 365 210.2 365 210.7L365 263.6C365 264.4 364.3 265.1 363.5 265.1 363.2 265.1 363 265 362.7 264.9L304.3 230.7C303.1 230 302.3 228.7 302.3 227.2L302.3 175.7C302.4 174.9 303.1 174.3 303.9 174.3ZM62.4 96.6C62.5 96.8 62.6 97.1 62.6 97.4L62.6 229.5C62.6 230.3 61.9 231 61.1 231L1.5 231C0.7 231 0 230.3 0 229.5L0 133.7C0 132.3 0.8 131 2 130.2L60.3 96C61.1 95.6 62 95.9 62.4 96.6ZM71.9 0.1 72 0.2 130.4 34.2C131.6 34.9 132.3 36.1 132.4 37.4L132.4 37.6 132.4 229.4C132.4 230.2 131.8 230.8 131 230.9L130.9 230.9 71.3 230.9C70.5 230.9 69.9 230.3 69.8 229.5L69.8 229.4 69.8 1.5C69.8 1.2 69.9 1 70 0.7 70.4 0.1 71.2-0.2 71.9 0.1ZM241.9 54.2C242.2 54.2 242.4 54.3 242.7 54.4L301.1 88.6C302.3 89.3 303.1 90.6 303.1 92.1L303.1 146.5C303.1 147.3 302.4 148 301.6 148 301.3 148 301.1 147.9 300.8 147.8L242.4 113.6C241.2 112.9 240.4 111.6 240.4 110.1L240.4 55.7C240.4 54.9 241.1 54.2 241.9 54.2Z";

export function Mark({ tone = "light", size = 40 }: { tone?: "light" | "brand" | "faint"; size?: number }) {
  const fill = tone === "light" ? "#fff" : tone === "faint" ? "#F3EFE4" : "url(#dbs-mark-grad)";
  return (
    <svg viewBox="0 0 365 266.5" width={size} height={(size * 266.5) / 365} aria-hidden="true" className="dbs-mark">
      {tone === "brand" && (
        <defs>
          <linearGradient id="dbs-mark-grad" x1="1" y1="0" x2="0" y2="0">
            <stop offset="0" stopColor="#0C1C45" />
            <stop offset="1" stopColor="#09E0CA" />
          </linearGradient>
        </defs>
      )}
      <path d={MARK} fill={fill} fillRule="evenodd" />
    </svg>
  );
}

export default function Logo({ tone = "light" }: { tone?: "light" | "brand" }) {
  return (
    <span className={`dbs-logo ${tone}`} aria-label="DBS Consulting">
      <Mark tone={tone} size={46} />
      <span className="dbs-word">
        <b>DBS</b>
        <span>Consulting</span>
      </span>
    </span>
  );
}
