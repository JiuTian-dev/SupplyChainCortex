import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { GlobalErrorBoundary } from "@/components/error";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SupplyChain Cortex · 跨境小家电供应链决策智能引擎",
  description: "SupplyChain Cortex — 集成实时汇率/天气/关税数据融合、级联风险传播、决策形式化推理、MCP Agent 编排的供应链决策智能引擎",
  keywords: ["供应链", "AI决策", "MCP", "小家电", "风险传播", "关税引擎", "实时汇率", "港口天气", "Agent编排"],
  authors: [{ name: "SupplyChain Cortex Team" }],
  icons: {
    icon: "/logo.svg",
  },
  openGraph: {
    title: "SupplyChain Cortex",
    description: "跨境小家电供应链决策智能引擎",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "SupplyChain Cortex",
    description: "跨境小家电供应链决策智能引擎",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <AuthProvider>
          <GlobalErrorBoundary level="page">
            {children}
          </GlobalErrorBoundary>
        </AuthProvider>
        <Toaster />
      </body>
    </html>
  );
}
