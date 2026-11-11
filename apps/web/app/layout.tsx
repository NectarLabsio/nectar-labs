import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "@nectar/ui/fonts.css";
import "@nectar/ui/tokens.css";
import "@nectar/ui/components.css";
import "@nectar/ui/app.css";
import { themeInitScript } from "@nectar/ui";
import { AppProvider } from "@/components/AppProvider";
import { SiteFooter, SiteHeader, SiteOverlays } from "@/components/SiteChrome";
import { assertProductionReady, getPublicConfig, getSiteConfig } from "@/lib/config.server";
import { appMetadata } from "@/lib/site-meta";

// WO-34a §6: a production build stops here while an operator field or SITE_URL / APP_URL is missing.
assertProductionReady();

export const metadata: Metadata = {
  title: { default: "Nectar Labs", template: "%s · Nectar Labs" },
  description: "Committed market-maker quotes raise borrowing limits on thin-exit collateral. NEAR testnet, mock collateral.",
  // Favicon and OG image: packages/ui/logo artwork already copied to public/brand (no new artwork).
  icons: { icon: "/brand/mark.svg", apple: "/brand/mark-256.png" },
  openGraph: { title: "Nectar Labs", description: "Committed buyers. Higher limits. NEAR testnet, mock collateral.", images: ["/brand/mark-256.png"] },
  ...appMetadata(),
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const config = getPublicConfig();
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        <AppProvider config={config}>
          <SiteHeader />
          <main id="main" className="skip-target" tabIndex={-1}>
            {children}
          </main>
          <SiteFooter contact={getSiteConfig().contact} />
          <SiteOverlays />
        </AppProvider>
      </body>
    </html>
  );
}
