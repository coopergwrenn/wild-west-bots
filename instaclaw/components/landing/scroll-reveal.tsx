"use client";

import { useEffect, useRef, useState } from "react";

export function ScrollReveal({ text }: { text: string }) {
  const sectionRef = useRef<HTMLElement>(null);
  const [revealedCount, setRevealedCount] = useState(0);
  const words = text.split(" ");

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    let active = false;

    function onScroll() {
      if (!active || !section) return;
      const rect = section.getBoundingClientRect();
      const viewportH = window.innerHeight;
      // progress: 0 when section top hits viewport bottom, 1 when section bottom hits viewport top
      const total = rect.height + viewportH;
      const scrolled = viewportH - rect.top;
      const progress = Math.min(Math.max(scrolled / total, 0), 1);
      // map progress to word count — reveal starts at 15% scroll, done by 85%
      const mapped = Math.min(Math.max((progress - 0.15) / 0.7, 0), 1);
      setRevealedCount(Math.round(mapped * words.length));
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        active = entry.isIntersecting;
        if (active) onScroll();
      },
      { threshold: 0 }
    );

    observer.observe(section);
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, [words.length]);

  return (
    <section ref={sectionRef} className="py-16 sm:py-[12vh] px-4">
      <div className="max-w-4xl mx-auto">
        <p
          className="text-3xl sm:text-4xl lg:text-5xl font-normal tracking-[-0.5px] leading-[1.25]"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          {words.map((word, i) => (
            <span key={i} className="scroll-word-wrapper">
              <span
                className={`scroll-word${i < revealedCount ? " revealed" : ""}`}
              >
                {word}
              </span>{" "}
            </span>
          ))}
        </p>
      </div>
    </section>
  );
}
