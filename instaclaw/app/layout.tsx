import type { Metadata } from "next";
import { Inter, Instrument_Serif } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "InstaClaw.io — Your Own OpenClaw Instance, Live in Minutes",
  description:
    "The easiest way to deploy your own OpenClaw instance. Full shell access, browser automation, skills, memory — your own dedicated VM. No DevOps required.",
  openGraph: {
    title: "InstaClaw.io — Your Own OpenClaw Instance, Live in Minutes",
    description:
      "The easiest way to deploy your own OpenClaw instance. Full shell access, browser automation, skills, memory — your own dedicated VM.",
    siteName: "InstaClaw.io",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "InstaClaw.io — Your Own OpenClaw Instance, Live in Minutes",
    description:
      "The easiest way to deploy your own OpenClaw instance. Full shell access, browser automation, skills, memory — your own dedicated VM.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link
          rel="preload"
          href="/_next/static/media/instrument-serif-latin-400-normal.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body className={`${inter.className} ${instrumentSerif.variable}`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
