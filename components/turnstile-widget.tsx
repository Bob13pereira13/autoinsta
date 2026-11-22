"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

/**
 * Cloudflare Turnstile widget (explicit rendering). The token it hands back
 * is single-use, so the parent resets the widget after each submission.
 */
declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, options: Record<string, unknown>) => string;
      reset: (id?: string) => void;
      remove: (id: string) => void;
    };
    __turnstileLoading?: Promise<void>;
  }
}

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  window.__turnstileLoading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Turnstile failed to load"));
    document.head.appendChild(script);
  });
  return window.__turnstileLoading;
}

export interface TurnstileHandle {
  reset: () => void;
}

const TurnstileWidget = forwardRef<TurnstileHandle, { siteKey: string; language: string; onToken: (token: string | null) => void }>(
  function TurnstileWidget({ siteKey, language, onToken }, ref) {
    const container = useRef<HTMLDivElement>(null);
    const widgetId = useRef<string | null>(null);
    const callback = useRef(onToken);
    useEffect(() => {
      callback.current = onToken;
    }, [onToken]);

    useImperativeHandle(ref, () => ({
      reset: () => {
        if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current);
        callback.current(null);
      },
    }));

    useEffect(() => {
      let cancelled = false;
      loadScript()
        .then(() => {
          if (cancelled || !container.current || !window.turnstile) return;
          widgetId.current = window.turnstile.render(container.current, {
            sitekey: siteKey,
            language,
            callback: (token: string) => callback.current(token),
            "expired-callback": () => callback.current(null),
            "error-callback": () => callback.current(null),
          });
        })
        .catch(() => callback.current(null));
      return () => {
        cancelled = true;
        if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
        widgetId.current = null;
      };
    }, [siteKey, language]);

    return <div ref={container} className="min-h-[65px]" />;
  }
);

export default TurnstileWidget;
