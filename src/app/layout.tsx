import type { Metadata } from "next";
import {
  Hanken_Grotesk,
  Noto_Sans_KR,
  Plus_Jakarta_Sans,
} from "next/font/google";

import { QueryProvider } from "@/components/query-provider";
import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

const displayFont = Hanken_Grotesk({
  variable: "--font-hanken-grotesk",
  subsets: ["latin"],
  display: "swap",
});

const bodyFont = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta-sans",
  subsets: ["latin"],
  display: "swap",
});

const koreanFont = Noto_Sans_KR({
  variable: "--font-noto-sans-kr",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "공방 클래스 예약",
  description:
    "공방 클래스의 일정과 남은 자리를 확인하고 회원가입 없이 예약을 신청하세요.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${displayFont.variable} ${bodyFont.variable} ${koreanFont.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <QueryProvider>{children}</QueryProvider>
        <Toaster
          theme="light"
          position="bottom-center"
          offset={24}
          duration={3200}
          toastOptions={{
            style: {
              background: "var(--surface-ink)",
              color: "var(--text-on-ink)",
              border: "none",
              borderRadius: "var(--radius-card)",
              boxShadow: "var(--shadow-raised)",
              fontFamily: "var(--font-body)",
              padding: "14px 16px 14px 18px",
              maxWidth: "min(440px, calc(100vw - 32px))",
            },
            classNames: {
              title: "text-base font-bold",
              description: "!text-sm !text-[var(--text-on-ink)]",
              error: "!text-[var(--status-danger)]",
            },
          }}
        />
      </body>
    </html>
  );
}
