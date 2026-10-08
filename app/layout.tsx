import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { fontVariables } from "@/lib/fonts";
import "./globals.css";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

const title = "Flappy Bird AI - Neuroevolution & Genetic Algorithm Simulator";
const description =
  "Watch an AI learn to play Flappy Bird using neural networks and a genetic algorithm. Play it yourself, train a flock of up to 10,000 birds, and see evolution explained step by step.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  keywords: [
    "Flappy Bird AI",
    "Genetic Algorithm JavaScript",
    "Neuroevolution",
    "Neural Network Visualization",
    "Machine Learning Game",
    "AI Simulation",
  ],
  authors: [{ name: "Abhinav Kuchhal", url: "https://abhinavkuchhal.com" }],
  openGraph: {
    type: "website",
    url: "/",
    title: "Flappy Bird AI: Genetic Algorithm Simulator",
    description: "An interactive simulation where AI learns to play Flappy Bird from scratch using neuroevolution.",
    images: ["/screenshots/AI_Mode.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Flappy Bird AI Simulator",
    description: "Watch AI evolve to beat Flappy Bird using genetic algorithms.",
    images: ["/screenshots/AI_Mode.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#0b1433",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Flappy Bird AI",
  applicationCategory: "GameApplication",
  operatingSystem: "Web Browser",
  description:
    "A browser-based implementation of Flappy Bird that uses a genetic algorithm and neural networks to teach AI agents how to play.",
  author: { "@type": "Person", name: "Abhinav Kuchhal", url: "https://abhinavkuchhal.com" },
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  featureList: "Genetic Algorithm, Neural Network Visualization, Neuroevolution simulation",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={fontVariables}>
      <body>
        {children}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <Analytics />
      </body>
    </html>
  );
}
