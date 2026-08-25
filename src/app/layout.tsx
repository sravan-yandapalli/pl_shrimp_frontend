import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";

import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Diziaqua | Shrimp PL Counting Solution",
    template: "%s | Diziaqua",
  },
  description:
    "Diziaqua helps shrimp hatcheries and aquaculture teams simplify shrimp post-larvae counting, improve efficiency, and manage farming operations with confidence.",
  keywords: [
    "shrimp PL counting",
    "shrimp post larvae counting",
    "shrimp hatchery",
    "shrimp aquaculture",
    "shrimp farming",
    "shrimp hatchery management",
    "aquaculture technology",
    "aquaculture",
  ],
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={montserrat.variable}>
      <body className="min-h-screen antialiased flex flex-col">
        <Navbar />

        <main className="flex-1">
          {children}
        </main>

        <Footer />
      </body>
    </html>
  );
}