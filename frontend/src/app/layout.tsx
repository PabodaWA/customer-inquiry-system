import type { Metadata } from "next";
import ThemeProvider from "../components/ThemeProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Coffee Ninja | Customer Inquiry Portal",
  description: "Manage customer inquiries with Coffee Ninja.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
