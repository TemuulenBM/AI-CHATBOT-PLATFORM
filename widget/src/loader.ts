/**
 * ConvoAI Widget Loader
 *
 * Tiny async loader (~2KB) that:
 * 1. Creates a stub API for queuing commands
 * 2. Loads the full widget on demand (user interaction or API call)
 * 3. Replays queued commands once widget is loaded
 *
 * Usage:
 * <script async src="https://domain.com/widget/loader.js" data-chatbot-id="xxx"></script>
 *
 * Or with advanced config:
 * <script async src="https://domain.com/widget/loader.js"
 *   data-chatbot-id="xxx"
 *   data-position="bottom-left"
 *   data-csp-nonce="abc123"
 *   data-lazy="true"
 * ></script>
 */

interface LoaderConfig {
  chatbotId: string;
  apiUrl: string;
  position?: "bottom-right" | "bottom-left";
  cspNonce?: string;
  lazy?: boolean;
}

interface QueuedCommand {
  command: string;
  args: unknown[];
}

// Global API stub
declare global {
  interface Window {
    ConvoAI: ConvoAIAPI & { q?: QueuedCommand[] };
    ConvoAIWidget: any;
  }
}

type ConvoAIAPI = (command: string, ...args: unknown[]) => void;

(function () {
  "use strict";

  // Prevent double initialization
  if (window.ConvoAI && typeof window.ConvoAI === "function" && !window.ConvoAI.q) {
    return;
  }

  const script = document.currentScript as HTMLScriptElement;
  if (!script) {
    console.error("ConvoAI: Could not find script element");
    return;
  }

  // Parse configuration from script attributes
  const config: LoaderConfig = {
    chatbotId: script.getAttribute("data-chatbot-id") || "",
    apiUrl: script.src.replace(/\/widget\/loader\.js.*$/, "").replace(/\/widget\.js.*$/, ""),
    position: (script.getAttribute("data-position") as LoaderConfig["position"]) || "bottom-right",
    cspNonce: script.getAttribute("data-csp-nonce") || undefined,
    lazy: script.getAttribute("data-lazy") === "true",
  };

  if (!config.chatbotId) {
    console.error("ConvoAI: Missing data-chatbot-id attribute");
    return;
  }

  // Command queue for pre-load API calls
  const commandQueue: QueuedCommand[] = [];

  // Widget instance (set after load)
  let widgetInstance: any = null;
  let isLoading = false;
  let isLoaded = false;

  // Stub API that queues commands until widget is loaded
  const ConvoAI: ConvoAIAPI & { q?: QueuedCommand[] } = function (command: string, ...args: unknown[]) {
    if (isLoaded && widgetInstance) {
      // Execute immediately if loaded
      executeCommand(command, args);
    } else {
      // Queue for later
      commandQueue.push({ command, args });

      // Trigger load for certain commands
      if (["open", "toggle", "sendMessage", "showProactive"].includes(command)) {
        loadWidget();
      }
    }
  };

  // Expose queue for debugging
  ConvoAI.q = commandQueue;

  // Make globally available
  window.ConvoAI = ConvoAI;

  function executeCommand(command: string, args: unknown[]): void {
    if (!widgetInstance) return;

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
        isLoaded = false;
        break;
      case "sendMessage":
        widgetInstance.sendMessage(args[0] as string);
        break;
      case "identify":
        widgetInstance.identify(args[0]);
        break;
      case "on":
        widgetInstance.on(args[0] as string, args[1] as () => void);
        break;
      case "off":
        widgetInstance.off(args[0] as string, args[1] as () => void);
        break;
      case "setLocale":
        widgetInstance.setLocale(args[0] as string);
        break;
      case "showProactive":
        // Show a custom proactive message
        widgetInstance.open();
        break;
      default:
        console.warn(`ConvoAI: Unknown command "${command}"`);
    }
  }

  function loadWidget(): Promise<void> {
    if (isLoaded || isLoading) {
      return Promise.resolve();
    }

    isLoading = true;

    return new Promise((resolve, reject) => {
      const widgetScript = document.createElement("script");
      widgetScript.src = `${config.apiUrl}/widget/widget.js`;
      widgetScript.async = true;

      if (config.cspNonce) {
        widgetScript.nonce = config.cspNonce;
      }

      widgetScript.onload = () => {
        isLoading = false;
        isLoaded = true;

        // Initialize widget
        if (window.ConvoAIWidget) {
          widgetInstance = new window.ConvoAIWidget({
            chatbotId: config.chatbotId,
            apiUrl: config.apiUrl,
            position: config.position,
            cspNonce: config.cspNonce,
          });

          // Replay queued commands
          while (commandQueue.length > 0) {
            const { command, args } = commandQueue.shift()!;
            executeCommand(command, args);
          }

          resolve();
        } else {
          reject(new Error("ConvoAIWidget not found after script load"));
        }
      };

      widgetScript.onerror = () => {
        isLoading = false;
        console.error("ConvoAI: Failed to load widget script");
        reject(new Error("Failed to load widget script"));
      };

      document.head.appendChild(widgetScript);
    });
  }

  // Create minimal button immediately for non-lazy loading
  function createPlaceholderButton(): void {
    const container = document.createElement("div");
    container.id = "convoai-loader-placeholder";
    container.style.cssText = `
      position: fixed;
      ${config.position === "bottom-right" ? "right: 20px;" : "left: 20px;"}
      bottom: 20px;
      z-index: 2147483647;
    `;

    const button = document.createElement("button");
    button.setAttribute("aria-label", "Open chat");
    button.style.cssText = `
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: #7c3aed;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
      transition: transform 0.2s;
    `;

    button.innerHTML = `
      <svg width="28" height="28" viewBox="0 0 24 24" fill="white">
        <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/>
        <path d="M7 9h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2z"/>
      </svg>
    `;

    button.addEventListener("mouseenter", () => {
      button.style.transform = "scale(1.05)";
    });

    button.addEventListener("mouseleave", () => {
      button.style.transform = "scale(1)";
    });

    button.addEventListener("click", () => {
      // Load full widget and open
      loadWidget().then(() => {
        // Remove placeholder
        container.remove();
        // Open widget
        if (widgetInstance) {
          widgetInstance.open();
        }
      });
    });

    container.appendChild(button);
    document.body.appendChild(container);
  }

  // Initialize
  function init(): void {
    if (config.lazy) {
      // Lazy mode: only load when user interacts
      createPlaceholderButton();
    } else {
      // Eager mode: load widget immediately
      loadWidget();
    }
  }

  // Wait for DOM to be ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Preconnect to API for faster subsequent requests
  const preconnect = document.createElement("link");
  preconnect.rel = "preconnect";
  preconnect.href = config.apiUrl;
  document.head.appendChild(preconnect);
})();
