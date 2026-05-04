import type { Metadata } from "next";
import { Carattere, Geist, Geist_Mono, Honk } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const honk = Honk({
  variable: "--font-honk",
  subsets: ["latin"],
});

const carattere = Carattere({
  variable: "--font-carattere",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "Tamagotchi",
  description: "A small persistent virtual pet in your browser",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${honk.variable} ${carattere.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
