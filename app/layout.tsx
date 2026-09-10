import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Onchain Formulas — Live blockchain data in every spreadsheet cell",
  description:
    "A Google Sheets function that turns any spreadsheet into a live, composable, permissioned window into onchain data. Powered by The Graph, ENSv2, and Bazantic.",
  keywords: ["web3", "blockchain", "google sheets", "defi", "aave", "ens", "the graph"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.variable}>{children}</body>
    </html>
  );
}
