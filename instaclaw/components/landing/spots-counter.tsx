"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";

const SNAPPY = [0.23, 1, 0.32, 1] as const;

export function SpotsCounter() {
  const [spots, setSpots] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/spots")
      .then((r) => r.json())
      .then((d) => setSpots(d.available ?? 0))
      .catch(() => setSpots(null));
  }, []);

  return (
    <AnimatePresence>
      {spots !== null && (
        <motion.span
          className="inline-flex items-center gap-2.5 px-6 py-2 rounded-full text-xs font-medium"
          style={{
            background: "linear-gradient(-75deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0.05))",
            backdropFilter: "blur(2px)",
            WebkitBackdropFilter: "blur(2px)",
            boxShadow: `
              rgba(0, 0, 0, 0.05) 0px 2px 2px 0px inset,
              rgba(255, 255, 255, 0.5) 0px -2px 2px 0px inset,
              rgba(0, 0, 0, 0.2) 0px 4px 2px -2px,
              rgba(255, 255, 255, 0.2) 0px 0px 1.6px 4px inset
            `,
            color: "var(--foreground)",
          }}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: SNAPPY }}
        >
          {/* Pulsing live dot */}
          <span className="relative flex h-1.5 w-1.5">
            <span
              className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping"
              style={{ background: spots > 0 ? "var(--accent)" : "var(--muted)" }}
            />
            <span
              className="relative inline-flex h-1.5 w-1.5 rounded-full"
              style={{ background: spots > 0 ? "var(--accent)" : "var(--muted)" }}
            />
          </span>

          {spots} {spots === 1 ? "Spot" : "Spots"} Open
        </motion.span>
      )}
    </AnimatePresence>
  );
}
