import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "anzanlab — Flash Anzan",
  description: "Practice flash anzan with positive and negative numbers, custom timing, and a pace that fits your mind.",
  metadataBase: new URL("https://anzanlab-flash-practice.benjamin-woo22.chatgpt.site"),
  openGraph: { images: ["/og.png"], title: "anzanlab — Flash Anzan", description: "Make every number count. Custom mental arithmetic practice." },
  twitter: { images: ["/og.png"], card: "summary_large_image", title: "anzanlab — Flash Anzan", description: "Make every number count." },
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
