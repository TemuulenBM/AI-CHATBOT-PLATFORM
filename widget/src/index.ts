/**
 * ConvoAI Widget Entry Point
 *
 * This file is the main entry point for the full widget bundle.
 * It auto-initializes from script tag attributes and exposes the API globally.
 */

import { ConvoAIWidget } from "./widget";
import { WidgetConfig, WidgetAPI, UserIdentity, WidgetEventName, WidgetEventCallback } from "./types";

// Export widget class for manual initialization
export { ConvoAIWidget };
export * from "./types";

// Singleton instance
let widgetInstance: ConvoAIWidget | null = null;

// API function that routes to widget instance
const ConvoAI: WidgetAPI = function (command: string, ...args: unknown[]): void {
  if (!widgetInstance) {
    console.warn("ConvoAI: Widget not initialized");
    return;
  }

  switch (command) {
    case "open":
      widgetInstance.open();
      break;
    case "close":
      widgetInstance.close();
      break;
    case "toggle":
      widgetInstance.toggle();
      break;
    case "destroy":
      widgetInstance.destroy();
      widgetInstance = null;
      break;
    case "sendMessage":
      widgetInstance.sendMessage(args[0] as string);
      break;
    case "identify":
      widgetInstance.identify(args[0] as UserIdentity);
      break;
    case "on":
      widgetInstance.on(args[0] as WidgetEventName, args[1] as WidgetEventCallback);
      break;
    case "off":
      widgetInstance.off(args[0] as WidgetEventName, args[1] as WidgetEventCallback);
      break;
    case "setLocale":
      widgetInstance.setLocale(args[0] as string);
      break;
    default:
      console.warn(`ConvoAI: Unknown command "${command}"`);
  }
} as WidgetAPI;

// Make globally available
(window as any).ConvoAI = ConvoAI;
(window as any).ConvoAIWidget = ConvoAIWidget;

// Auto-initialize from script tag
(function () {
  const script = document.currentScript as HTMLScriptElement;
  if (!script) return;

  const chatbotId = script.getAttribute("data-chatbot-id");
  if (!chatbotId) {
    // Don't error - might be loaded programmatically
    return;
  }

  const config: Partial<WidgetConfig> = {
    chatbotId,
    position: (script.getAttribute("data-position") as WidgetConfig["position"]) || "bottom-right",
    apiUrl: script.src.replace(/\/widget\/widget\.js.*$/, "").replace(/\/widget\.js.*$/, ""),
    cspNonce: script.getAttribute("data-csp-nonce") || undefined,
    locale: script.getAttribute("data-locale") || undefined,
    soundEnabled: script.getAttribute("data-sound") !== "false",
  };

  function init() {
    // Check if we already have a queued instance from the loader
    if ((window as any).ConvoAI?.q) {
      const queue = (window as any).ConvoAI.q;
      // Clear queue reference
      delete (window as any).ConvoAI.q;

      // Create widget
      widgetInstance = new ConvoAIWidget(config);

      // Replay queued commands
      for (const { command, args } of queue) {
        (ConvoAI as any)(command, ...(args as [unknown, ...unknown[]]));
      }
    } else {
      // Direct initialization
      widgetInstance = new ConvoAIWidget(config);
    }
  }

  // Wait for DOM to be ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
