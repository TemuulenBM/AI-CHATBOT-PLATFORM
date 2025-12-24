/**
 * ChatAI Embeddable Widget
 * Usage: <script src="https://yourdomain.com/widget.js" data-chatbot-id="xxx"></script>
 */

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: Date | string;
}

interface StoredConversation {
  messages: Array<{
    role: "user" | "assistant";
    content: string;
    timestamp: string;
  }>;
  created_at: string | null;
}

interface WidgetConfig {
  chatbotId: string;
  primaryColor: string;
  welcomeMessage: string;
  position: "bottom-right" | "bottom-left";
  apiUrl: string;
}

interface ChatbotInfo {
  id: string;
  name: string;
  settings: {
    primaryColor: string;
    welcomeMessage: string;
  };
}

class ChatAIWidget {
  private config: WidgetConfig;
  private isOpen: boolean = false;
  private messages: ChatMessage[] = [];
  private sessionId: string;
  private container: HTMLDivElement | null = null;
  private chatContainer: HTMLDivElement | null = null;
  private isLoading: boolean = false;
  private storageAvailable: boolean = false;

  constructor(config: Partial<WidgetConfig>) {
    this.config = {
      chatbotId: config.chatbotId || "",
      primaryColor: config.primaryColor || "#7c3aed",
      welcomeMessage: config.welcomeMessage || "Hi! How can I help you today?",
      position: config.position || "bottom-right",
      apiUrl: config.apiUrl || window.location.origin,
    };

    this.storageAvailable = this.checkStorageAvailable();
    this.sessionId = this.getOrCreateSessionId();
    this.init();
  }

  /**
   * Check if localStorage is available (may be blocked in private browsing)
   */
  private checkStorageAvailable(): boolean {
    try {
      const testKey = "__chatai_test__";
      localStorage.setItem(testKey, "1");
      localStorage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get existing session ID from localStorage or create a new one
   */
  private getOrCreateSessionId(): string {
    const storageKey = `chatai_session_${this.config.chatbotId}`;
    
    if (this.storageAvailable) {
      try {
        const existingSession = localStorage.getItem(storageKey);
        if (existingSession) {
          return existingSession;
        }
        
        const newSession = "session_" + Math.random().toString(36).substring(2, 15);
        localStorage.setItem(storageKey, newSession);
        return newSession;
      } catch {
        // Fall through to generate new session
      }
    }
    
    return "session_" + Math.random().toString(36).substring(2, 15);
  }

  /**
   * Clear the current session and start fresh
   */
  private clearSession(): void {
    const storageKey = `chatai_session_${this.config.chatbotId}`;
    
    if (this.storageAvailable) {
      try {
        localStorage.removeItem(storageKey);
      } catch {
        // Ignore storage errors
      }
    }
    
    // Generate new session
    this.sessionId = "session_" + Math.random().toString(36).substring(2, 15);
    
    if (this.storageAvailable) {
      try {
        localStorage.setItem(storageKey, this.sessionId);
      } catch {
        // Ignore storage errors
      }
    }
    
    // Reset messages to welcome message only
    this.messages = [{
      role: "assistant",
      content: this.config.welcomeMessage,
      timestamp: new Date(),
    }];
    this.renderMessages();
  }

  /**
   * Load conversation history from the server
   */
  private async loadConversationHistory(): Promise<void> {
    try {
      const response = await fetch(
        `${this.config.apiUrl}/api/chat/${this.config.chatbotId}/${this.sessionId}`
      );
      
      if (response.ok) {
        const data: StoredConversation = await response.json();
        
        if (data.messages && data.messages.length > 0) {
          // Convert stored messages to ChatMessage format
          this.messages = data.messages.map((msg) => ({
            role: msg.role,
            content: msg.content,
            timestamp: new Date(msg.timestamp),
          }));
          return;
        }
      }
    } catch (error) {
      console.warn("ChatAI: Failed to load conversation history");
    }
    
    // No history found - add welcome message
    this.messages = [{
      role: "assistant",
      content: this.config.welcomeMessage,
      timestamp: new Date(),
    }];
  }

  private async init(): Promise<void> {
    // Fetch chatbot config from API
    try {
      const response = await fetch(
        `${this.config.apiUrl}/api/chat/widget/${this.config.chatbotId}`
      );
      if (response.ok) {
        const data: ChatbotInfo = await response.json();
        this.config.primaryColor = data.settings.primaryColor || this.config.primaryColor;
        this.config.welcomeMessage = data.settings.welcomeMessage || this.config.welcomeMessage;
      }
    } catch (error) {
      console.warn("ChatAI: Failed to load chatbot config, using defaults");
    }

    this.injectStyles();
    this.render();

    // Load existing conversation or show welcome message
    await this.loadConversationHistory();
    this.renderMessages();
  }

  private injectStyles(): void {
    const style = document.createElement("style");
    style.id = "chatai-widget-styles";
    style.textContent = `
      #chatai-widget-container {
        position: fixed;
        ${this.config.position === "bottom-right" ? "right: 20px;" : "left: 20px;"}
        bottom: 20px;
        z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      }

      #chatai-widget-button {
        width: 60px;
        height: 60px;
        border-radius: 50%;
        background: ${this.config.primaryColor};
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
        transition: transform 0.2s, box-shadow 0.2s;
      }

      #chatai-widget-button:hover {
        transform: scale(1.05);
        box-shadow: 0 6px 25px rgba(0, 0, 0, 0.3);
      }

      #chatai-widget-button svg {
        width: 28px;
        height: 28px;
        fill: white;
      }

      #chatai-chat-window {
        position: absolute;
        ${this.config.position === "bottom-right" ? "right: 0;" : "left: 0;"}
        bottom: 75px;
        width: 380px;
        height: 520px;
        background: #1a1a2e;
        border-radius: 16px;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
        display: none;
        flex-direction: column;
        overflow: hidden;
        border: 1px solid rgba(255, 255, 255, 0.1);
      }

      #chatai-chat-window.open {
        display: flex;
        animation: chatai-slide-up 0.3s ease;
      }

      @keyframes chatai-slide-up {
        from {
          opacity: 0;
          transform: translateY(20px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      #chatai-header {
        background: linear-gradient(135deg, ${this.config.primaryColor}, ${this.adjustColor(this.config.primaryColor, -20)});
        padding: 16px 20px;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      #chatai-header-title {
        color: white;
        font-weight: 600;
        font-size: 16px;
        display: flex;
        align-items: center;
        gap: 10px;
      }

      #chatai-header-title::before {
        content: '';
        width: 10px;
        height: 10px;
        background: #4ade80;
        border-radius: 50%;
        animation: chatai-pulse 2s infinite;
      }

      @keyframes chatai-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }

      #chatai-header-actions {
        display: flex;
        gap: 8px;
        align-items: center;
      }

      #chatai-clear-btn,
      #chatai-close-btn {
        background: rgba(255, 255, 255, 0.2);
        border: none;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.2s;
      }

      #chatai-clear-btn:hover,
      #chatai-close-btn:hover {
        background: rgba(255, 255, 255, 0.3);
      }

      #chatai-clear-btn svg,
      #chatai-close-btn svg {
        width: 18px;
        height: 18px;
        stroke: white;
      }

      #chatai-clear-btn {
        width: 28px;
        height: 28px;
      }

      #chatai-clear-btn svg {
        width: 14px;
        height: 14px;
      }

      #chatai-messages {
        flex: 1;
        overflow-y: auto;
        padding: 20px;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      #chatai-messages::-webkit-scrollbar {
        width: 6px;
      }

      #chatai-messages::-webkit-scrollbar-track {
        background: transparent;
      }

      #chatai-messages::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.2);
        border-radius: 3px;
      }

      .chatai-message {
        max-width: 85%;
        padding: 12px 16px;
        border-radius: 16px;
        font-size: 14px;
        line-height: 1.5;
        word-wrap: break-word;
      }

      .chatai-message.user {
        align-self: flex-end;
        background: ${this.config.primaryColor};
        color: white;
        border-bottom-right-radius: 4px;
      }

      .chatai-message.assistant {
        align-self: flex-start;
        background: rgba(255, 255, 255, 0.1);
        color: #e5e5e5;
        border-bottom-left-radius: 4px;
      }

      .chatai-typing {
        display: flex;
        gap: 4px;
        padding: 16px;
      }

      .chatai-typing span {
        width: 8px;
        height: 8px;
        background: rgba(255, 255, 255, 0.4);
        border-radius: 50%;
        animation: chatai-bounce 1.4s infinite ease-in-out;
      }

      .chatai-typing span:nth-child(1) { animation-delay: 0s; }
      .chatai-typing span:nth-child(2) { animation-delay: 0.2s; }
      .chatai-typing span:nth-child(3) { animation-delay: 0.4s; }

      @keyframes chatai-bounce {
        0%, 80%, 100% { transform: translateY(0); }
        40% { transform: translateY(-6px); }
      }

      #chatai-input-container {
        padding: 16px;
        background: rgba(0, 0, 0, 0.2);
        border-top: 1px solid rgba(255, 255, 255, 0.1);
      }

      #chatai-input-form {
        display: flex;
        gap: 10px;
      }

      #chatai-input {
        flex: 1;
        padding: 12px 16px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 24px;
        background: rgba(255, 255, 255, 0.05);
        color: white;
        font-size: 14px;
        outline: none;
        transition: border-color 0.2s;
      }

      #chatai-input::placeholder {
        color: rgba(255, 255, 255, 0.4);
      }

      #chatai-input:focus {
        border-color: ${this.config.primaryColor};
      }

      #chatai-send-btn {
        width: 44px;
        height: 44px;
        border-radius: 50%;
        background: ${this.config.primaryColor};
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.2s, opacity 0.2s;
      }

      #chatai-send-btn:hover {
        transform: scale(1.05);
      }

      #chatai-send-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        transform: none;
      }

      #chatai-send-btn svg {
        width: 20px;
        height: 20px;
        fill: white;
      }

      #chatai-powered-by {
        text-align: center;
        padding: 8px;
        font-size: 11px;
        color: rgba(255, 255, 255, 0.4);
        background: rgba(0, 0, 0, 0.2);
      }

      #chatai-powered-by a {
        color: ${this.config.primaryColor};
        text-decoration: none;
        font-weight: 500;
      }

      #chatai-powered-by a:hover {
        text-decoration: underline;
      }

      @media (max-width: 480px) {
        #chatai-chat-window {
          width: calc(100vw - 40px);
          height: calc(100vh - 140px);
          max-height: 500px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  private adjustColor(color: string, amount: number): string {
    const hex = color.replace("#", "");
    const num = parseInt(hex, 16);
    const r = Math.min(255, Math.max(0, (num >> 16) + amount));
    const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00ff) + amount));
    const b = Math.min(255, Math.max(0, (num & 0x0000ff) + amount));
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
  }

  private render(): void {
    this.container = document.createElement("div");
    this.container.id = "chatai-widget-container";
    this.container.innerHTML = `
      <div id="chatai-chat-window">
        <div id="chatai-header">
          <span id="chatai-header-title">AI Assistant</span>
          <div id="chatai-header-actions">
            <button id="chatai-clear-btn" title="Start new conversation">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
              </svg>
            </button>
            <button id="chatai-close-btn" title="Close">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>
        <div id="chatai-messages"></div>
        <div id="chatai-input-container">
          <form id="chatai-input-form">
            <input type="text" id="chatai-input" placeholder="Type your message..." autocomplete="off" />
            <button type="submit" id="chatai-send-btn">
              <svg viewBox="0 0 24 24">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
              </svg>
            </button>
          </form>
        </div>
        <div id="chatai-powered-by">
          Powered by <a href="__WIDGET_POWERED_BY_URL__" target="_blank">ChatAI</a>
        </div>
      </div>
      <button id="chatai-widget-button">
        <svg viewBox="0 0 24 24">
          <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/>
          <path d="M7 9h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2z"/>
        </svg>
      </button>
    `;

    document.body.appendChild(this.container);

    this.chatContainer = this.container.querySelector("#chatai-messages");

    // Event listeners
    const button = this.container.querySelector("#chatai-widget-button") as HTMLButtonElement;
    const closeBtn = this.container.querySelector("#chatai-close-btn") as HTMLButtonElement;
    const clearBtn = this.container.querySelector("#chatai-clear-btn") as HTMLButtonElement;
    const form = this.container.querySelector("#chatai-input-form") as HTMLFormElement;
    const chatWindow = this.container.querySelector("#chatai-chat-window") as HTMLDivElement;

    button.addEventListener("click", () => this.toggle());
    closeBtn.addEventListener("click", () => this.close());
    clearBtn.addEventListener("click", () => this.clearSession());
    form.addEventListener("submit", (e) => this.handleSubmit(e));

    // Close on outside click
    document.addEventListener("click", (e) => {
      if (
        this.isOpen &&
        !chatWindow.contains(e.target as Node) &&
        !button.contains(e.target as Node)
      ) {
        this.close();
      }
    });
  }

  private toggle(): void {
    this.isOpen = !this.isOpen;
    const chatWindow = this.container?.querySelector("#chatai-chat-window");
    if (chatWindow) {
      chatWindow.classList.toggle("open", this.isOpen);
    }

    if (this.isOpen) {
      const input = this.container?.querySelector("#chatai-input") as HTMLInputElement;
      setTimeout(() => input?.focus(), 100);
    }
  }

  private close(): void {
    this.isOpen = false;
    const chatWindow = this.container?.querySelector("#chatai-chat-window");
    if (chatWindow) {
      chatWindow.classList.remove("open");
    }
  }

  private renderMessages(): void {
    if (!this.chatContainer) return;

    this.chatContainer.innerHTML = this.messages
      .map(
        (msg) => `
        <div class="chatai-message ${msg.role}">
          ${this.escapeHtml(msg.content)}
        </div>
      `
      )
      .join("");

    if (this.isLoading) {
      this.chatContainer.innerHTML += `
        <div class="chatai-message assistant chatai-typing">
          <span></span><span></span><span></span>
        </div>
      `;
    }

    this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  private async handleSubmit(e: Event): Promise<void> {
    e.preventDefault();

    const input = this.container?.querySelector("#chatai-input") as HTMLInputElement;
    const sendBtn = this.container?.querySelector("#chatai-send-btn") as HTMLButtonElement;
    const message = input.value.trim();

    if (!message || this.isLoading) return;

    // Add user message
    this.messages.push({
      role: "user",
      content: message,
      timestamp: new Date(),
    });

    input.value = "";
    this.isLoading = true;
    sendBtn.disabled = true;
    this.renderMessages();

    try {
      // Use streaming endpoint
      const response = await fetch(`${this.config.apiUrl}/api/chat/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chatbotId: this.config.chatbotId,
          sessionId: this.sessionId,
          message,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to get response");
      }

      // Handle SSE streaming
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = "";

      // Add empty assistant message
      this.messages.push({
        role: "assistant",
        content: "",
        timestamp: new Date(),
      });
      this.isLoading = false;
      this.renderMessages();

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.type === "chunk") {
                  assistantMessage += data.content;
                  this.messages[this.messages.length - 1].content = assistantMessage;
                  this.renderMessages();
                }
              } catch {
                // Ignore parse errors
              }
            }
          }
        }
      }
    } catch (error) {
      console.error("ChatAI: Error sending message", error);
      this.messages.push({
        role: "assistant",
        content: "Sorry, I encountered an error. Please try again.",
        timestamp: new Date(),
      });
      this.isLoading = false;
      this.renderMessages();
    }

    sendBtn.disabled = false;
  }
}

// Auto-initialize from script tag
(function () {
  const script = document.currentScript as HTMLScriptElement;
  if (script) {
    const chatbotId = script.getAttribute("data-chatbot-id");
    const position = script.getAttribute("data-position") as "bottom-right" | "bottom-left" | null;

    if (chatbotId) {
      // Wait for DOM to be ready
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => {
          new ChatAIWidget({
            chatbotId,
            position: position || "bottom-right",
            apiUrl: script.src.replace(/\/widget\.js.*$/, ""),
          });
        });
      } else {
        new ChatAIWidget({
          chatbotId,
          position: position || "bottom-right",
          apiUrl: script.src.replace(/\/widget\.js.*$/, ""),
        });
      }
    } else {
      console.error("ChatAI: Missing data-chatbot-id attribute");
    }
  }
})();

// Export for manual initialization
(window as any).ChatAIWidget = ChatAIWidget;
