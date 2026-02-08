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
        <motion.div
          className="flex items-center justify-center gap-3"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: SNAPPY }}
        >
          {/* Pulsing live dot */}
          <span className="relative flex h-2 w-2">
            <span
              className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping"
              style={{ background: spots > 0 ? "var(--accent)" : "var(--muted)" }}
            />
            <span
              className="relative inline-flex h-2 w-2 rounded-full"
              style={{ background: spots > 0 ? "var(--accent)" : "var(--muted)" }}
            />
          </span>

          <span className="text-xs uppercase tracking-[2px]" style={{ color: "var(--muted)" }}>
            <span
              className="text-sm tabular-nums"
              style={{
                fontFamily: "var(--font-serif)",
                color: "var(--foreground)",
                letterSpacing: "0",
              }}
            >
              {spots}
            </span>
            {" "}{spots === 1 ? "spot" : "spots"} open
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
