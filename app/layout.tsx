import type { Metadata } from "next";
import { Fraunces, Karla, Geist_Mono } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

// Dark Roast type pairing: Fraunces carries the hospitality voice (headings,
// wordmark), Karla does the quiet everyday work.
const karla = Karla({ subsets: ["latin"], variable: "--font-sans" });

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  axes: ["SOFT", "WONK", "opsz"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Covrly — shift scheduling that covers itself",
  description:
    "AI-handled shift scheduling for cafés and restaurants: availability, replacements, swaps and German working-time law — without the group-chat chaos.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn(
        "h-full",
        "antialiased",
        karla.variable,
        fraunces.variable,
        geistMono.variable,
        "font-sans",
      )}
    >
      <body className="min-h-full flex flex-col">
        <TooltipProvider>
          <Toaster richColors />
          {children}
        </TooltipProvider>
      </body>
    </html>
  );
}
