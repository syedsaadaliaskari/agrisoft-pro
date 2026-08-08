import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/lib/theme";
import { LanguageProvider } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "Agri Soft Pro",
  description: "Local desktop agri ERP — Electron + Next.js + SQLite",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu:wght@400;600;700&display=swap"
          rel="stylesheet"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("agri_soft_theme");document.documentElement.setAttribute("data-theme",t==="dark"?"dark":"light");var l=localStorage.getItem("agri_soft_locale");if(l==="ur"){document.documentElement.setAttribute("lang","ur");document.documentElement.setAttribute("dir","rtl");document.documentElement.setAttribute("data-locale","ur");}else{document.documentElement.setAttribute("lang","en");document.documentElement.setAttribute("dir","ltr");document.documentElement.setAttribute("data-locale","en");}}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <ThemeProvider>
          <LanguageProvider>{children}</LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
