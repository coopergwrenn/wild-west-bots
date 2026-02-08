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

              <div className="flex gap-6 sm:gap-10 py-10 sm:py-14 items-baseline">
                {/* Step number */}
                <span
                  className="text-5xl sm:text-6xl font-normal tracking-[-2px] shrink-0 leading-none"
                  style={{
                    fontFamily: "var(--font-serif)",
                    color: "var(--accent)",
                  }}
                >
                  {step.number}
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
