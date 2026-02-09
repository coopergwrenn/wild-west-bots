"use client";

import { motion } from "motion/react";

const SNAPPY = [0.23, 1, 0.32, 1] as const;

const steps = [
  {
    number: "01",
    title: "Get Invited",
    description:
      "Join the waitlist and get your invite code. We roll out access in batches.",
  },
  {
    number: "02",
    title: "Connect & Choose",
    description:
      "Link your Telegram bot, pick your plan, and choose All-Inclusive or BYOK.",
  },
  {
    number: "03",
    title: "Deploy",
    description:
      "Your dedicated OpenClaw instance goes live on its own VM. Full shell access, skills, memory — everything.",
  },
];

export function HowItWorks() {
  return (
    <section className="py-16 sm:py-[12vh] px-4">
      <div className="max-w-3xl mx-auto">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6, ease: SNAPPY }}
        >
          <h2
            className="text-4xl sm:text-5xl lg:text-6xl font-normal tracking-[-1px] leading-[1.05] mb-6"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            How It Works
          </h2>
        </motion.div>

        {/* Clean-line vertical steps — no cards */}
        <div className="space-y-0">
          {steps.map((step, i) => (
            <motion.div
              key={step.number}
              className="relative"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ delay: i * 0.12, duration: 0.6, ease: SNAPPY }}
            >
              {/* Top border line */}
              <div
                className="h-px w-full"
                style={{ background: "var(--border)" }}
              />

              <div className="flex gap-6 sm:gap-10 py-10 sm:py-14 items-start">
                {/* Step number in glass orb */}
                <span
                  className="shrink-0 mt-1 flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 rounded-full relative overflow-hidden"
                  style={{
                    background: "radial-gradient(circle at 38% 32%, rgba(220,103,67,0.3), rgba(220,103,67,0.12) 55%, rgba(180,70,40,0.2) 100%)",
                    boxShadow: `
                      inset 0 2px 4px rgba(255,255,255,0.45),
                      inset 0 -2px 4px rgba(0,0,0,0.12),
                      inset 0 0 6px rgba(220,103,67,0.08),
                      0 2px 6px rgba(220,103,67,0.1),
                      0 1px 2px rgba(0,0,0,0.06)
                    `,
                  }}
                >
                  {/* Glass highlight */}
                  <span
                    className="absolute top-[3px] left-[5px] w-[16px] sm:w-[18px] h-[8px] sm:h-[9px] rounded-full pointer-events-none"
                    style={{
                      background: "linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 100%)",
                    }}
                  />
                  <span
                    className="relative text-base sm:text-lg font-medium tracking-[-0.5px]"
                    style={{
                      fontFamily: "var(--font-serif)",
                      color: "var(--accent)",
                    }}
                  >
                    {step.number}
                  </span>
                </span>

                {/* Content */}
                <div>
                  <h3
                    className="text-2xl sm:text-3xl font-normal tracking-[-0.5px] mb-3"
                    style={{ fontFamily: "var(--font-serif)" }}
                  >
                    {step.title}
                  </h3>
                  <p
                    className="text-base leading-relaxed max-w-md"
                    style={{ color: "var(--muted)" }}
                  >
                    {step.description}
                  </p>
                </div>
              </div>

              {/* Bottom border on last item */}
              {i === steps.length - 1 && (
                <div
                  className="h-px w-full"
                  style={{ background: "var(--border)" }}
                />
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
