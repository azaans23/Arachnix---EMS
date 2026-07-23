import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";

export const metadata: Metadata = {
  title: "Arachnix EMS",
  description: "Arachnix Employee Management System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen flex flex-col bg-stone text-obsidian">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
