"use client";

import { useEffect } from "react";
import Lenis from "lenis";

export function LenisProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const lenis = new Lenis({
      autoRaf: true,
      duration: 1.2,
      easing: (t: number) => 1 - Math.pow(1 - t, 4),
    });

    return () => {
      lenis.destroy();
    };
  }, []);

  return <>{children}</>;
}
