import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { Providers } from "@/components/providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "NeuralBet — Football Prediction Model",
  description: "Statistical football prediction model with a 15-layer xG pipeline, neural net adjustment, 7 intelligence modules, and backtest-gated accuracy. 30+ markets. Kelly-optimal staking.",
  keywords: ["football predictions", "statistical model", "xG", "expected goals", "value bets", "football analytics"],
  authors: [{ name: "NeuralBet", url: "https://github.com/Heisdawrld/Neuralbet" }],
  openGraph: {
    title: "NeuralBet — Football Prediction Model",
    description: "15-layer xG pipeline. Neural net. 7 intelligence modules. 30+ markets.",
    type: "website",
    siteName: "NeuralBet",
  },
  twitter: {
    card: "summary_large_image",
    title: "NeuralBet — Football Prediction Model",
    description: "15-layer xG pipeline. Neural net. 7 intelligence modules. 30+ markets.",
  },
  icons: {
    icon: '/icon-192.png',
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'NeuralBet',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <Providers>
          {children}
        </Providers>
        <Toaster richColors position="bottom-right" />
      </body>
    </html>
  );
}
