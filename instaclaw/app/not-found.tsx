import Link from "next/link";

const glassStyle = {
  background:
    "linear-gradient(-75deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0.05))",
  backdropFilter: "blur(2px)",
  WebkitBackdropFilter: "blur(2px)",
  boxShadow: `
    rgba(0, 0, 0, 0.05) 0px 2px 2px 0px inset,
    rgba(255, 255, 255, 0.5) 0px -2px 2px 0px inset,
    rgba(0, 0, 0, 0.1) 0px 2px 4px 0px,
    rgba(255, 255, 255, 0.2) 0px 0px 1.6px 4px inset
  `,
};

// 8x8 pixel art confused crab
const crabGrid = [
  "  1  1  ",
  " 1  1 1 ",
  " 111111 ",
  "11233211",
  "11222211",
  " 122221 ",
  " 1 11 1 ",
  "1  11  1",
];

const crabColors: Record<string, string> = {
  "1": "#DC6743",
  "2": "#E8845F",
  "3": "#1A1A1A",
};

export default function NotFound() {
  return (
    <div
      style={{
        "--background": "#f8f7f4",
        "--foreground": "#333334",
        "--muted": "#6b6b6b",
        "--accent": "#DC6743",
        background: "#f8f7f4",
        color: "#333334",
      } as React.CSSProperties}
      className="min-h-screen flex flex-col items-center justify-center px-4"
    >
      {/* Pixel art crab in glass orb */}
      <div
        className="w-24 h-24 rounded-full flex items-center justify-center mb-8"
        style={{
          background:
            "radial-gradient(circle at 35% 35%, #f0e6dddd, #f0e6dd88 40%, rgba(0,0,0,0.25) 100%)",
          boxShadow: `
            inset 0 -6px 12px rgba(0,0,0,0.25),
            inset 0 6px 12px rgba(255,255,255,0.4),
            inset 0 0 8px rgba(0,0,0,0.15),
            0 4px 16px rgba(0,0,0,0.2),
            0 2px 6px rgba(0,0,0,0.15)
          `,
        }}
      >
        {/* Glass highlight */}
        <div
          className="absolute w-10 h-5 rounded-full pointer-events-none"
          style={{
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0) 100%)",
            transform: "translate(-8px, -28px)",
          }}
        />
        <svg
          width="56"
          height="56"
          viewBox="0 0 8 8"
          xmlns="http://www.w3.org/2000/svg"
          shapeRendering="crispEdges"
        >
          {crabGrid.map((row, y) =>
            [...row].map((char, x) => {
              if (char === " ") return null;
              const color = crabColors[char];
              if (!color) return null;
              return (
                <rect
                  key={`${x}-${y}`}
                  x={x}
                  y={y}
                  width={1}
                  height={1}
                  fill={color}
                />
              );
            })
          )}
        </svg>
      </div>

      {/* 404 heading */}
      <h1
        className="text-7xl sm:text-9xl font-normal tracking-[-2px] leading-none mb-4"
        style={{ fontFamily: "var(--font-serif)", color: "var(--accent)" }}
      >
        404
      </h1>

      {/* Message */}
      <h2
        className="text-2xl sm:text-3xl font-normal tracking-[-0.5px] mb-3 text-center"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        This page wandered off
      </h2>
      <p
        className="text-sm sm:text-base mb-8 text-center max-w-xs"
        style={{ color: "var(--muted)" }}
      >
        Even our AI couldn&apos;t find what you&apos;re looking for. Let&apos;s
        get you back on track.
      </p>

      {/* CTA button */}
      <Link
        href="/"
        className="px-8 py-3 rounded-xl text-sm font-semibold transition-all hover:opacity-80"
        style={{
          ...glassStyle,
          color: "var(--foreground)",
        }}
      >
        Back to Home
      </Link>

      {/* Subtle footer */}
      <p className="mt-16 text-xs" style={{ color: "var(--muted)" }}>
        instaclaw.io
      </p>
    </div>
  );
}
