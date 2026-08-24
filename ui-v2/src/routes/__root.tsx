import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { Toaster } from "sonner";
import appCss from "../styles.css?url";

const APP_NAME = "Ravenstack Keep";
const host = import.meta.env.VITE_PUBLIC_HOSTNAME;
const ogImage = host ? `https://${host}/og.jpg` : undefined;
const xBanner = host
  ? `https://og.grok.me/v1/banner.png?host=${encodeURIComponent(host)}&title=${encodeURIComponent(APP_NAME)}&color=0B0B0A`
  : undefined;

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: APP_NAME },
      {
        name: "description",
        content: "Walkable command layer for Ravenstack Keep — Raziel, Valerie, Oracle, Corvid.",
      },
      { name: "apple-mobile-web-app-title", content: APP_NAME },
      { name: "theme-color", content: "#0b0b0a" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "x:game" },
      ...(ogImage
        ? [
            { property: "og:image", content: ogImage },
            { property: "og:image:width", content: "1200" },
            { property: "og:image:height", content: "630" },
          ]
        : []),
      ...(xBanner
        ? [
            { property: "x:game:image", content: xBanner },
            { property: "x:game:image:width", content: "1200" },
            { property: "x:game:image:height", content: "264" },
          ]
        : []),
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400&family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600&display=swap",
      },
    ],
  }),
  component: () => (
    <html lang="en" className="antialiased" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <PreviewHostBridge />
        <AuthProvider>
          <Outlet />
          <Toaster
            theme="dark"
            position="bottom-right"
            toastOptions={{
              className: "bg-elevated text-fg border-line",
            }}
          />
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  ),
});
