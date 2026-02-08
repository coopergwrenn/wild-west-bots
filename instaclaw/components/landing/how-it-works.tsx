"use client";

import { motion } from "motion/react";

const steps = [
  {
    number: "1",
    title: "Get Invited",
    description:
      "Join the waitlist and get your invite code. We roll out access in batches.",
  },
  {
    number: "2",
    title: "Connect & Choose",
    description:
      "Link your Telegram bot, pick your plan, and choose All-Inclusive or BYOK.",
  },
  {
    number: "3",
    title: "Deploy",
    description:
      "Your dedicated OpenClaw instance goes live on its own VM. Full shell access, skills, memory — everything.",
  },
];

export function HowItWorks() {
  return (
    <section className="py-24 px-4">
      <div className="max-w-5xl mx-auto">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
        >
          <h2
            className="text-4xl sm:text-5xl lg:text-6xl font-normal tracking-[-1px] leading-[1.05] mb-4"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            How It Works
          </h2>
          <p style={{ color: "var(--muted)" }}>
            Three steps. Your own OpenClaw. That&apos;s it.
          </p>
        </motion.div>

        <div className="grid gap-6 sm:grid-cols-3">
          {steps.map((step, i) => (
            <motion.div
              key={step.number}
              className="glass rounded-xl p-6 text-center"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ delay: i * 0.15, duration: 0.6 }}
            >
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold mx-auto mb-4"
                style={{
                  background: "var(--accent)",
                  color: "#ffffff",
                }}
              >
                {step.number}
              </div>
              <h3 className="text-lg font-semibold mb-2">{step.title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
                {step.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
