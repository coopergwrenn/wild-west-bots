"use client";

import { useState } from "react";

const faqs = [
  {
    q: "What is InstaClaw?",
    a: "InstaClaw gives you a personal AI agent that runs on a dedicated server. It connects to Telegram, Discord, or Slack and can execute code, manage files, search the web, and take real actions — not just chat.",
  },
  {
    q: "How is this different from ChatGPT?",
    a: "ChatGPT is a chatbot. InstaClaw gives you a full AI agent with a dedicated server. It can run shell commands, write and execute code, manage files, access the internet, and use tools — all from your messaging app.",
  },
  {
    q: "What can my bot actually do?",
    a: "Run shell commands, write and execute Python/Node scripts, search the web, manage files, browse websites, use MCP tools, access the Clawlancer marketplace, and much more. It has full computer access on its dedicated VM.",
  },
  {
    q: "Do I need any technical knowledge?",
    a: "No. Setting up takes 2 minutes: create a Telegram bot via BotFather, paste the token, choose a plan. Everything else is automated.",
  },
  {
    q: "What's BYOK mode?",
    a: "Bring Your Own Key. You provide your own Anthropic API key and pay Anthropic directly for AI usage. This gives you lower InstaClaw pricing since we don't cover API costs.",
  },
  {
    q: "Can I use multiple channels?",
    a: "Yes! You can connect Telegram, Discord, Slack, and WhatsApp simultaneously. All channels share the same AI agent and workspace.",
  },
  {
    q: "Is there a free trial?",
    a: "Yes! The Starter plan includes a 7-day free trial. Full functionality, no credit card charge during the trial period.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Absolutely. Cancel from the billing page at any time. No contracts, no cancellation fees.",
  },
];

export function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section className="py-20 px-4">
      <div className="max-w-3xl mx-auto">
        <h2
          className="text-4xl sm:text-5xl lg:text-6xl font-normal tracking-[-1px] leading-[1.05] text-center mb-12"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Frequently Asked Questions
        </h2>
        <div className="space-y-2">
          {faqs.map((faq, i) => (
            <div
              key={i}
              className="glass rounded-xl overflow-hidden"
              style={{ border: "1px solid var(--border)" }}
            >
              <button
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
                className="w-full text-left px-6 py-4 flex items-center justify-between cursor-pointer"
              >
                <span className="font-medium">{faq.q}</span>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="shrink-0 ml-4"
                  style={{
                    transform: openIndex === i ? "rotate(180deg)" : "rotate(0deg)",
                    transition: "transform 0.2s ease",
                    color: "var(--muted)",
                  }}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {openIndex === i && (
                <p
                  className="px-6 pb-4 text-sm leading-relaxed"
                  style={{ color: "var(--muted)" }}
                >
                  {faq.a}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
