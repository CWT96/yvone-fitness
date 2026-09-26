import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Yvonne Fitness · 私教预约",
  description:
    "专属于你与教练的训练空间。预约课程、查看训练计划、记录每一次进步。",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
