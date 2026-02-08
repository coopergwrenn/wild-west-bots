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
    <section className="faq-section py-16 sm:py-[12vh] px-4">
      <div className="max-w-3xl mx-auto">
        <h2
          className="text-4xl sm:text-5xl lg:text-6xl font-normal tracking-[-1px] leading-[1.05] text-center mb-12"
          style={{ fontFamily: "var(--font-serif)", color: "#333334" }}
        >
          Frequently Asked Questions
        </h2>
        <div>
          {faqs.map((faq, i) => (
            <div
              key={i}
              className="faq-item"
              data-state={openIndex === i ? "open" : "closed"}
            >
              <button
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
                className="w-full text-left px-0 py-6 flex items-center justify-between cursor-pointer"
                style={{ color: "#333334" }}
              >
                <span className="font-medium text-base">{faq.q}</span>
                <span
                  className="faq-icon shrink-0 ml-4 text-xl leading-none select-none"
                  style={{ color: "#6b6b6b" }}
                >
                  +
                </span>
              </button>
              <div className="faq-answer">
                <p
                  className="pb-6 text-sm leading-relaxed"
                  style={{ color: "#6b6b6b" }}
                >
                  {faq.a}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
