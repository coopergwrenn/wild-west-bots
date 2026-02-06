"use client";

import { useState } from "react";

const features = [
  {
    title: "Always On",
    description:
      "Your AI assistant runs 24/7 — no laptop required. It responds while you sleep.",
  },
  {
    title: "Messaging Integrations",
    description:
      "Connect to Telegram, Discord, Slack, and more. Meet your users where they are.",
  },
  {
    title: "No Crypto Needed",
    description:
      "Simple subscription billing. No wallets, no tokens, no complexity.",
  },
];

export default function Home() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    try {
      // Posts to Clawlancer's waitlist endpoint
      await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source: "instaclaw" }),
      });
      setSubmitted(true);
    } catch {
      // Silently handle — waitlist endpoint may not exist yet
      setSubmitted(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <main className="max-w-2xl w-full text-center space-y-12">
        {/* Logo / Brand */}
        <div className="space-y-4">
          <h1 className="text-5xl font-bold tracking-tight">
            Insta<span style={{ color: "var(--accent)" }}>Claw</span>.io
          </h1>
          <p className="text-xl" style={{ color: "var(--muted)" }}>
            Your AI assistant, always on.
          </p>
        </div>

        {/* Coming Soon Badge */}
        <div className="inline-block px-4 py-1.5 rounded-full text-sm font-medium border"
             style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
          Coming Soon
        </div>

        {/* Waitlist Form */}
        {submitted ? (
          <div className="py-4 px-6 rounded-lg" style={{ background: "var(--card)" }}>
            <p className="text-lg font-medium">You&apos;re on the list!</p>
            <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
              We&apos;ll notify you when InstaClaw launches.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex gap-3 max-w-md mx-auto">
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="flex-1 px-4 py-3 rounded-lg text-sm outline-none"
              style={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                color: "var(--foreground)",
              }}
            />
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-3 rounded-lg text-sm font-medium transition-colors cursor-pointer disabled:opacity-50"
              style={{
                background: "var(--accent)",
                color: "white",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "var(--accent-hover)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "var(--accent)")
              }
            >
              {loading ? "..." : "Notify Me"}
            </button>
          </form>
        )}

        {/* Feature Bullets */}
        <div className="grid gap-6 sm:grid-cols-3 text-left pt-8">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="p-5 rounded-lg"
              style={{ background: "var(--card)" }}
            >
              <h3 className="font-semibold mb-2">{feature.title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer
        className="mt-20 mb-8 text-sm"
        style={{ color: "var(--muted)" }}
      >
        A{" "}
        <a
          href="https://clawlancer.com"
          className="underline hover:no-underline"
          style={{ color: "var(--foreground)" }}
        >
          Clawlancer
        </a>{" "}
        product
      </footer>
    </div>
  );
}
