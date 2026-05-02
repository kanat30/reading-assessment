/// <reference lib="webworker" />

import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import {
  CacheFirst,
  NetworkOnly,
  Serwist,
  StaleWhileRevalidate,
} from "serwist";

// This declares the value of `injectionPoint` to TypeScript.
// `injectionPoint` is the string that will be replaced by the
// actual precache manifest.
declare global {
  interface ServiceWorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Student routes: stale-while-revalidate
    {
      matcher: ({ url }: { url: URL }) => /^\/read\/[^/]+/.test(url.pathname),
      handler: new StaleWhileRevalidate({
        cacheName: "student-routes",
      }),
    },
    // Static assets: cache-first
    {
      matcher: ({ url }: { url: URL }) =>
        /\.(js|css|woff2?|png|jpg|jpeg|svg|ico)$/.test(url.pathname),
      handler: new CacheFirst({
        cacheName: "static-assets",
      }),
    },
    // API routes: network-only (never cache)
    {
      matcher: ({ url }: { url: URL }) => /^\/api\//.test(url.pathname),
      handler: new NetworkOnly(),
    },
    // Dashboard/teacher routes: network-only
    {
      matcher: ({ url }: { url: URL }) => /^\/dashboard/.test(url.pathname),
      handler: new NetworkOnly(),
    },
    // Default cache behavior from Serwist
    ...defaultCache,
  ],
});

serwist.addEventListeners();
