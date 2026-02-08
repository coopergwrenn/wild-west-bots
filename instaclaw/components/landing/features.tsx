"use client";

import { motion } from "motion/react";
import {
  Zap,
  Terminal,
  Shield,
  Brain,
  CreditCard,
  Globe,
  Fingerprint,
} from "lucide-react";

const SNAPPY = [0.23, 1, 0.32, 1] as const;

const features = [
  {
    icon: Zap,
    title: "Instant Deployment",
    description:
      "Go from zero to a live OpenClaw instance in minutes. No DevOps required.",
  },
  {
    icon: Terminal,
    title: "Full Shell Access",
    description:
      "Your own dedicated VM with shell access, file system, and browser automation.",
  },
  {
    icon: Shield,
    title: "Always On",
    description:
      "99.9% uptime with auto-healing. Your instance never sleeps, even when you do.",
  },
  {
    icon: Brain,
    title: "Skills & Memory",
    description:
      "Full OpenClaw feature set — skills, persistent memory, and custom configurations.",
  },
  {
    icon: CreditCard,
    title: "Simple Pricing",
    description:
      "Flat monthly fee, everything included. Or bring your own API key and save.",
  },
  {
    icon: Globe,
    title: "BYOK Option",
    description:
      "Bring your own Anthropic API key for maximum flexibility and lower costs.",
  },
  {
    icon: Fingerprint,
    title: "Human Verification",
    description:
      "Prove there's a real person behind your agent. Verified agents earn a public trust badge — powered by World ID's privacy-preserving proof of personhood.",
  },
];

export function Features() {
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
            Everything You Need
          </h2>
        </motion.div>

        {/* Clean-line vertical list — no cards */}
        <div className="space-y-0">
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              className="relative"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ delay: i * 0.08, duration: 0.6, ease: SNAPPY }}
            >
              {/* Top border line */}
              <div
                className="h-px w-full"
                style={{ background: "var(--border)" }}
              />

              <div className="flex gap-5 sm:gap-8 py-8 sm:py-10 items-start">
                {/* Icon */}
                <feature.icon
                  className="w-6 h-6 shrink-0 mt-1"
                  style={{ color: "var(--accent)" }}
                  strokeWidth={1.5}
                />

                {/* Content */}
                <div>
                  <h3
                    className="text-xl sm:text-2xl font-normal tracking-[-0.5px] mb-2"
                    style={{ fontFamily: "var(--font-serif)" }}
                  >
                    {feature.title}
                  </h3>
                  <p
                    className="text-sm sm:text-base leading-relaxed max-w-md"
                    style={{ color: "var(--muted)" }}
                  >
                    {feature.description}
                  </p>
                </div>
              </div>

              {/* Bottom border on last item */}
              {i === features.length - 1 && (
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
