import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { platformConfig } from "@/lib/config";
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
  title: {
    template: `%s | ${platformConfig.name}`,
    default: `${platformConfig.name} - School Result Management Platform`,
  },
  description: `${platformConfig.name} school result management platform for Nigerian educational institutions.`,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#FAF8F3] text-[#2C2825] selection:bg-[#F6EBEB] selection:text-[#671B24]">
        {children}
      </body>
    </html>
  );
}
