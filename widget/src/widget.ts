/**
 * ConvoAI Widget v2.0
 * Industry-standard embeddable chat widget with:
 * - Shadow DOM encapsulation
 * - Full accessibility (ARIA, keyboard navigation)
 * - JavaScript API
 * - Rich message types (Markdown)
 * - Pre-chat forms
 * - Proactive messages
 * - i18n support
 * - Analytics & error tracking
 */

import {
  ChatMessage,
  WidgetConfig,
  ChatbotInfo,
  UserIdentity,
  WidgetEventName,
  WidgetEventCallback,
  WidgetTranslations,
  ProactiveTrigger,
  StoredConversation,
} from "./types";
import { getWidgetStyles } from "./styles";
import { getTranslations, detectLocale } from "./i18n";
import { parseMarkdown } from "./utils/markdown";
import { storage } from "./utils/storage";
import { analytics, trackWidgetOpen, trackWidgetClose, trackMessageSent, trackFeedback } from "./utils/analytics";
import { playSimpleBeep, setSoundEnabled } from "./utils/sound";

const WIDGET_VERSION = "2.0.0";

export class ConvoAIWidget {
  private config: WidgetConfig;
  private translations: WidgetTranslations;
  private isOpen: boolean = false;
  private messages: ChatMessage[] = [];
  private sessionId: string;
  private conversationId: string | null = null;
  private shadowRoot: ShadowRoot | null = null;
  private container: HTMLElement | null = null;
  private isLoading: boolean = false;
  private feedbackSubmitted: boolean = false;
  private messageCount: number = 0;
  private unreadCount: number = 0;
  private showPreChat: boolean = false;
  private userIdentity: UserIdentity | null = null;
  private proactiveTimers: number[] = [];
  private eventListeners: Map<WidgetEventName, Set<WidgetEventCallback>> = new Map();
  private isDestroyed: boolean = false;
  private scrollObserver: IntersectionObserver | null = null;
  private exitIntentHandler: ((e: MouseEvent) => void) | null = null;

  constructor(config: Partial<WidgetConfig>) {
    // Initialize config with defaults
    this.config = {
      chatbotId: config.chatbotId || "",
      primaryColor: config.primaryColor || "#7c3aed",
      welcomeMessage: config.welcomeMessage || "Hi! How can I help you today?",
      position: config.position || "bottom-right",
      apiUrl: config.apiUrl || window.location.origin,
      locale: config.locale || detectLocale(),
      cspNonce: config.cspNonce,
      preChatForm: config.preChatForm,
      proactiveTriggers: config.proactiveTriggers,
      soundEnabled: config.soundEnabled ?? true,
      translations: config.translations,
    };

    // Set up translations
    this.translations = config.translations || getTranslations(this.config.locale || "en");

    // Set up sound
    setSoundEnabled(this.config.soundEnabled ?? true);

    // Initialize session
    this.sessionId = storage.getSessionId(this.config.chatbotId);
    this.unreadCount = storage.getUnreadCount(this.config.chatbotId);
    this.userIdentity = storage.getUserIdentity(this.config.chatbotId);

    // Check if pre-chat form should be shown
    this.showPreChat =
      !!this.config.preChatForm?.enabled && !storage.hasCompletedPreChat(this.config.chatbotId);

    // Initialize
    this.init();
  }

  private async init(): Promise<void> {
    const startTime = Date.now();

    // Fetch chatbot config from API
    try {
      const response = await fetch(`${this.config.apiUrl}/api/chat/widget/${this.config.chatbotId}`);
      if (response.ok) {
        const data: ChatbotInfo = await response.json();
        this.config.primaryColor = data.settings.primaryColor || this.config.primaryColor;
        this.config.welcomeMessage = data.settings.welcomeMessage || this.config.welcomeMessage;

        if (data.settings.preChatForm && !this.config.preChatForm) {
          this.config.preChatForm = data.settings.preChatForm;
          this.showPreChat =
            !!this.config.preChatForm?.enabled && !storage.hasCompletedPreChat(this.config.chatbotId);
        }

        if (data.settings.proactiveTriggers) {
          this.config.proactiveTriggers = data.settings.proactiveTriggers;
        }
      }
    } catch (error) {
      console.warn("ConvoAI: Failed to load chatbot config, using defaults");
    }

    // Initialize analytics
    analytics.initialize(this.config.apiUrl, this.config.chatbotId, this.sessionId);

    // Create widget UI
    this.createWidget();

    // Load conversation history
    await this.loadConversationHistory();
    this.renderMessages();

    // Set up proactive triggers
    this.setupProactiveTriggers();

    // Set up keyboard shortcuts
    this.setupKeyboardShortcuts();

    // Emit ready event
    this.emit("ready", { loadTimeMs: Date.now() - startTime });
  }

  private createWidget(): void {
    // Create host element
    const host = document.createElement("div");
    host.id = "convoai-widget-host";

    // Create Shadow DOM for style encapsulation
    this.shadowRoot = host.attachShadow({ mode: "closed" });

    // Create style element with optional nonce
    const style = document.createElement("style");
    if (this.config.cspNonce) {
      style.nonce = this.config.cspNonce;
    }
    style.textContent = getWidgetStyles(this.config.primaryColor, this.config.position);
    this.shadowRoot.appendChild(style);

    // Add custom CSS if provided
    if (this.config.customCss) {
      const customStyle = document.createElement("style");
      if (this.config.cspNonce) {
        customStyle.nonce = this.config.cspNonce;
      }
      customStyle.textContent = this.config.customCss;
      this.shadowRoot.appendChild(customStyle);
    }

    // Create container
    this.container = document.createElement("div");
    this.container.className = "convoai-container";
    this.container.setAttribute("role", "region");
    this.container.setAttribute("aria-label", "Chat widget");
    this.container.innerHTML = this.getWidgetHTML();
    this.shadowRoot.appendChild(this.container);

    // Add to document
    document.body.appendChild(host);

    // Attach event listeners
    this.attachEventListeners();
  }

  private getWidgetHTML(): string {
    const t = this.translations;

    return `
      <!-- Proactive Message Container -->
      <div class="convoai-proactive" style="display: none;" role="alert" aria-live="polite">
        <div class="convoai-proactive-message"></div>
        <div class="convoai-proactive-actions">
          <button class="convoai-proactive-btn primary" data-action="accept">Chat now</button>
          <button class="convoai-proactive-btn secondary" data-action="dismiss">Dismiss</button>
        </div>
      </div>

      <!-- Chat Window -->
      <div
        class="convoai-window"
        role="dialog"
        aria-modal="true"
        aria-label="Chat window"
        aria-hidden="true"
      >
        <!-- Header -->
        <div class="convoai-header">
          <span class="convoai-header-title">
            <span class="convoai-status-dot" aria-hidden="true"></span>
            <span>AI Assistant</span>
          </span>
          <div class="convoai-header-actions">
            <button
              class="convoai-header-btn small"
              data-action="clear"
              title="${t.newConversation}"
              aria-label="${t.newConversation}"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
              </svg>
            </button>
            <button
              class="convoai-header-btn"
              data-action="close"
              title="${t.closeChat}"
              aria-label="${t.closeChat}"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- Pre-Chat Form (if enabled) -->
        <div class="convoai-prechat" style="display: none;">
          <div class="convoai-prechat-title">${t.preChatTitle}</div>
          <form class="convoai-prechat-form"></form>
        </div>

        <!-- Messages -->
        <div
          class="convoai-messages"
          role="log"
          aria-live="polite"
          aria-relevant="additions"
          tabindex="0"
        >
          <span class="convoai-sr-only">Chat messages</span>
        </div>

        <!-- Input -->
        <div class="convoai-input-container">
          <form class="convoai-input-form">
            <input
              type="text"
              class="convoai-input"
              placeholder="${t.placeholder}"
              autocomplete="off"
              aria-label="Message input"
            />
            <button
              type="submit"
              class="convoai-send-btn"
              aria-label="${t.sendButton}"
            >
              <svg viewBox="0 0 24 24">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
              </svg>
            </button>
          </form>
        </div>

        <!-- Feedback Container -->
        <div class="convoai-feedback-container"></div>

        <!-- Powered By -->
        <div class="convoai-powered-by">
          ${t.poweredBy} <a href="__WIDGET_POWERED_BY_URL__" target="_blank" rel="noopener noreferrer">ChatAI</a>
        </div>
      </div>

      <!-- Widget Button -->
      <button
        class="convoai-button"
        aria-label="Open chat"
        aria-expanded="false"
        aria-haspopup="dialog"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/>
          <path d="M7 9h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2z"/>
        </svg>
        <span class="convoai-badge" aria-live="polite"></span>
      </button>
    `;
  }

  private attachEventListeners(): void {
    if (!this.container) return;

    // Widget button
    const button = this.container.querySelector(".convoai-button") as HTMLButtonElement;
    button?.addEventListener("click", () => this.toggle());

    // Close button
    const closeBtn = this.container.querySelector('[data-action="close"]') as HTMLButtonElement;
    closeBtn?.addEventListener("click", () => this.close());

    // Clear button
    const clearBtn = this.container.querySelector('[data-action="clear"]') as HTMLButtonElement;
    clearBtn?.addEventListener("click", () => this.clearSession());

    // Message form
    const form = this.container.querySelector(".convoai-input-form") as HTMLFormElement;
    form?.addEventListener("submit", (e) => this.handleSubmit(e));

    // Proactive message buttons
    const proactiveContainer = this.container.querySelector(".convoai-proactive");
    proactiveContainer?.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      const action = target.closest("[data-action]")?.getAttribute("data-action");
      if (action === "accept") {
        this.hideProactive();
        this.open();
      } else if (action === "dismiss") {
        this.hideProactive();
      }
    });

    // Close on outside click
    document.addEventListener("click", (e) => {
      const host = document.getElementById("convoai-widget-host");
      if (this.isOpen && host && !host.contains(e.target as Node)) {
        this.close();
      }
    });

    // Update badge
    this.updateBadge();

    // Initialize pre-chat form if needed
    if (this.showPreChat) {
      this.initPreChatForm();
    }
  }

  private initPreChatForm(): void {
    if (!this.container || !this.config.preChatForm) return;

    const preChatContainer = this.container.querySelector(".convoai-prechat") as HTMLElement;
    const formContainer = this.container.querySelector(".convoai-prechat-form") as HTMLFormElement;
    const messagesContainer = this.container.querySelector(".convoai-messages") as HTMLElement;
    const inputContainer = this.container.querySelector(".convoai-input-container") as HTMLElement;

    if (!preChatContainer || !formContainer) return;

    // Build form fields
    const t = this.translations;
    let formHTML = "";

    for (const field of this.config.preChatForm.fields) {
      const required = field.required ? '<span class="required">*</span>' : "";
      const requiredAttr = field.required ? "required" : "";

      if (field.type === "select" && field.options) {
        formHTML += `
          <div class="convoai-prechat-field">
            <label class="convoai-prechat-label">${field.label} ${required}</label>
            <select
              name="${field.name}"
              class="convoai-prechat-input"
              ${requiredAttr}
            >
              <option value="">${field.placeholder || "Select..."}</option>
              ${field.options.map((opt) => `<option value="${opt}">${opt}</option>`).join("")}
            </select>
          </div>
        `;
      } else {
        formHTML += `
          <div class="convoai-prechat-field">
            <label class="convoai-prechat-label">${field.label} ${required}</label>
            <input
              type="${field.type}"
              name="${field.name}"
              class="convoai-prechat-input"
              placeholder="${field.placeholder || ""}"
              ${requiredAttr}
            />
          </div>
        `;
      }
    }

    formHTML += `<button type="submit" class="convoai-prechat-submit">${t.preChatSubmit}</button>`;
    formContainer.innerHTML = formHTML;

    // Handle form submission
    formContainer.addEventListener("submit", (e) => {
      e.preventDefault();
      const formData = new FormData(formContainer);
      const data: Record<string, string> = {};

      for (const [key, value] of formData.entries()) {
        data[key] = value.toString();
      }

      // Store user identity
      this.userIdentity = {
        name: data.name,
        email: data.email,
        phone: data.phone,
        customData: data,
      };
      storage.setUserIdentity(this.config.chatbotId, this.userIdentity);
      storage.setPreChatCompleted(this.config.chatbotId);

      // Hide pre-chat, show messages
      preChatContainer.style.display = "none";
      messagesContainer.style.display = "flex";
      inputContainer.style.display = "block";
      this.showPreChat = false;

      // Emit event
      this.emit("prechat_submitted", this.userIdentity);

      // Focus input
      const input = this.container?.querySelector(".convoai-input") as HTMLInputElement;
      input?.focus();
    });

    // Show form, hide messages initially
    preChatContainer.style.display = "flex";
    messagesContainer.style.display = "none";
    inputContainer.style.display = "none";
  }

  private setupProactiveTriggers(): void {
    if (!this.config.proactiveTriggers) return;

    for (const trigger of this.config.proactiveTriggers) {
      if (!trigger.enabled) continue;
      if (storage.hasSeenProactive(this.config.chatbotId, trigger.id)) continue;

      switch (trigger.type) {
        case "time_on_page":
          const timerId = window.setTimeout(() => {
            this.showProactive(trigger);
          }, (trigger.value as number) * 1000);
          this.proactiveTimers.push(timerId);
          break;

        case "scroll_depth":
          this.setupScrollTrigger(trigger);
          break;

        case "exit_intent":
          this.setupExitIntentTrigger(trigger);
          break;

        case "page_url":
          if (window.location.href.includes(trigger.value as string)) {
            window.setTimeout(() => this.showProactive(trigger), 2000);
          }
          break;
      }
    }
  }

  private setupScrollTrigger(trigger: ProactiveTrigger): void {
    const targetDepth = trigger.value as number;

    const checkScroll = () => {
      const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
      const scrollPercent = (window.scrollY / scrollHeight) * 100;

      if (scrollPercent >= targetDepth) {
        window.removeEventListener("scroll", checkScroll);
        this.showProactive(trigger);
      }
    };

    window.addEventListener("scroll", checkScroll, { passive: true });
  }

  private setupExitIntentTrigger(trigger: ProactiveTrigger): void {
    this.exitIntentHandler = (e: MouseEvent) => {
      if (e.clientY <= 0) {
        document.removeEventListener("mouseout", this.exitIntentHandler!);
        this.showProactive(trigger);
      }
    };

    document.addEventListener("mouseout", this.exitIntentHandler);
  }

  private showProactive(trigger: ProactiveTrigger): void {
    if (this.isOpen || this.isDestroyed) return;
    if (storage.hasSeenProactive(this.config.chatbotId, trigger.id)) return;

    const proactiveEl = this.container?.querySelector(".convoai-proactive") as HTMLElement;
    const messageEl = proactiveEl?.querySelector(".convoai-proactive-message");

    if (proactiveEl && messageEl) {
      messageEl.textContent = trigger.message;
      proactiveEl.style.display = "block";
      storage.markProactiveSeen(this.config.chatbotId, trigger.id);

      // Play sound
      playSimpleBeep();
    }
  }

  private hideProactive(): void {
    const proactiveEl = this.container?.querySelector(".convoai-proactive") as HTMLElement;
    if (proactiveEl) {
      proactiveEl.style.display = "none";
    }
  }

  private setupKeyboardShortcuts(): void {
    document.addEventListener("keydown", (e) => {
      // Escape to close
      if (e.key === "Escape" && this.isOpen) {
        this.close();
      }

      // Ctrl/Cmd + / to toggle
      if ((e.ctrlKey || e.metaKey) && e.key === "/") {
        e.preventDefault();
        this.toggle();
      }
    });
  }

  private async loadConversationHistory(): Promise<void> {
    try {
      const response = await fetch(
        `${this.config.apiUrl}/api/chat/${this.config.chatbotId}/${this.sessionId}`
      );

      if (response.ok) {
        const data: StoredConversation = await response.json();

        if (data.messages && data.messages.length > 0) {
          if (data.id) {
            this.conversationId = data.id;
            this.checkExistingFeedback();
          }

          this.messages = data.messages.map((msg) => ({
            role: msg.role,
            content: msg.content,
            timestamp: new Date(msg.timestamp),
          }));
          this.messageCount = data.messages.filter((m) => m.role === "user").length;
          return;
        }
      }
    } catch (error) {
      console.warn("ConvoAI: Failed to load conversation history");
    }

    // No history - add welcome message
    this.messages = [
      {
        role: "assistant",
        content: this.config.welcomeMessage,
        timestamp: new Date(),
      },
    ];
  }

  private async checkExistingFeedback(): Promise<void> {
    if (!this.conversationId) return;

    try {
      const response = await fetch(
        `${this.config.apiUrl}/api/feedback/${this.conversationId}`
      );

      if (response.ok) {
        const data = await response.json();
        this.feedbackSubmitted = data.hasFeedback;
      }
    } catch {
      // Ignore
    }
  }

  private renderMessages(): void {
    const messagesContainer = this.container?.querySelector(".convoai-messages");
    if (!messagesContainer) return;

    // Keep screen reader announcement
    const srOnly = '<span class="convoai-sr-only">Chat messages</span>';

    messagesContainer.innerHTML =
      srOnly +
      this.messages
        .map((msg) => {
          const content = msg.role === "assistant" ? parseMarkdown(msg.content) : this.escapeHtml(msg.content);

          return `
          <div
            class="convoai-message ${msg.role}"
            role="article"
            aria-label="${msg.role === "user" ? "You" : "Assistant"}"
          >
            ${content}
          </div>
        `;
        })
        .join("");

    // Add typing indicator if loading
    if (this.isLoading) {
      messagesContainer.innerHTML += `
        <div class="convoai-typing" role="status" aria-label="${this.translations.typingIndicator}">
          <span></span><span></span><span></span>
        </div>
      `;
    }

    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    // Render feedback prompt
    this.renderFeedbackPrompt();
  }

  private renderFeedbackPrompt(): void {
    const feedbackContainer = this.container?.querySelector(".convoai-feedback-container");
    if (!feedbackContainer) return;

    const t = this.translations;

    if (this.messageCount >= 3 && !this.feedbackSubmitted && this.conversationId) {
      feedbackContainer.innerHTML = `
        <div class="convoai-feedback">
          <p>${t.feedbackPrompt}</p>
          <div class="convoai-feedback-buttons">
            <button class="convoai-feedback-btn positive" data-rating="positive" aria-label="${t.feedbackYes}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
              </svg>
              ${t.feedbackYes}
            </button>
            <button class="convoai-feedback-btn negative" data-rating="negative" aria-label="${t.feedbackNo}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/>
              </svg>
              ${t.feedbackNo}
            </button>
          </div>
        </div>
      `;

      // Add click handlers
      const positiveBtn = feedbackContainer.querySelector('[data-rating="positive"]');
      const negativeBtn = feedbackContainer.querySelector('[data-rating="negative"]');

      positiveBtn?.addEventListener("click", () => this.submitFeedback("positive"));
      negativeBtn?.addEventListener("click", () => this.submitFeedback("negative"));
    } else if (this.feedbackSubmitted) {
      feedbackContainer.innerHTML = `
        <div class="convoai-feedback-thanks">${t.feedbackThanks}</div>
      `;
    } else {
      feedbackContainer.innerHTML = "";
    }
  }

  private async submitFeedback(rating: "positive" | "negative"): Promise<void> {
    if (!this.conversationId || this.feedbackSubmitted) return;

    try {
      const response = await fetch(`${this.config.apiUrl}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: this.conversationId,
          chatbotId: this.config.chatbotId,
          rating,
        }),
      });

      if (response.ok) {
        this.feedbackSubmitted = true;
        storage.setFeedbackSubmitted(this.config.chatbotId, this.conversationId);
        trackFeedback(rating);
        this.renderFeedbackPrompt();
        this.emit("feedback_submitted", { rating });
      }
    } catch (error) {
      console.error("ConvoAI: Failed to submit feedback", error);
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  private async handleSubmit(e: Event): Promise<void> {
    e.preventDefault();

    const input = this.container?.querySelector(".convoai-input") as HTMLInputElement;
    const sendBtn = this.container?.querySelector(".convoai-send-btn") as HTMLButtonElement;
    const message = input.value.trim();

    if (!message || this.isLoading) return;

    // Add user message
    this.messages.push({
      role: "user",
      content: message,
      timestamp: new Date(),
    });
    this.messageCount++;

    input.value = "";
    this.isLoading = true;
    sendBtn.disabled = true;
    this.renderMessages();

    trackMessageSent();

    try {
      const response = await fetch(`${this.config.apiUrl}/api/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatbotId: this.config.chatbotId,
          sessionId: this.sessionId,
          message,
          userIdentity: this.userIdentity,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to get response");
      }

      // Handle SSE streaming
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = "";

      this.messages.push({
        role: "assistant",
        content: "",
        timestamp: new Date(),
      });
      this.renderMessages();

      if (reader) {
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data: ")) continue;

            try {
              const data = JSON.parse(trimmed.slice(6));

              if (data.type === "chunk") {
                this.isLoading = false;
                assistantMessage += data.content;
                this.messages[this.messages.length - 1].content = assistantMessage;
                this.renderMessages();
              } else if (data.type === "error") {
                this.isLoading = false;
                this.messages[this.messages.length - 1].content = data.message || this.translations.errorMessage;
                this.renderMessages();
              } else if (data.type === "done") {
                this.isLoading = false;
                if (data.conversationId) {
                  this.conversationId = data.conversationId;
                }
                this.renderMessages();

                // Play sound for new message
                if (!this.isOpen) {
                  playSimpleBeep();
                  this.incrementUnread();
                }
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }

      this.isLoading = false;
      this.renderMessages();
      this.emit("message", { role: "assistant", content: assistantMessage });
    } catch (error) {
      console.error("ConvoAI: Error sending message", error);
      this.messages.push({
        role: "assistant",
        content: this.translations.errorMessage,
        timestamp: new Date(),
      });
      this.isLoading = false;
      this.renderMessages();
      this.emit("error", { message: "Failed to send message" });
    }

    sendBtn.disabled = false;
  }

  // Public API Methods

  public open(): void {
    if (this.isDestroyed) return;

    this.isOpen = true;
    const chatWindow = this.container?.querySelector(".convoai-window") as HTMLElement;
    const button = this.container?.querySelector(".convoai-button") as HTMLButtonElement;

    if (chatWindow) {
      chatWindow.classList.add("open");
      chatWindow.classList.remove("closing");
      chatWindow.setAttribute("aria-hidden", "false");
    }

    if (button) {
      button.setAttribute("aria-expanded", "true");
    }

    // Clear unread
    this.clearUnread();

    // Hide proactive
    this.hideProactive();

    // Focus input or first form field
    setTimeout(() => {
      if (this.showPreChat) {
        const firstInput = this.container?.querySelector(".convoai-prechat-input") as HTMLInputElement;
        firstInput?.focus();
      } else {
        const input = this.container?.querySelector(".convoai-input") as HTMLInputElement;
        input?.focus();
      }
    }, 100);

    storage.setWidgetOpen(this.config.chatbotId, true);
    trackWidgetOpen();
    this.emit("open");
  }

  public close(): void {
    if (this.isDestroyed) return;

    const chatWindow = this.container?.querySelector(".convoai-window") as HTMLElement;
    const button = this.container?.querySelector(".convoai-button") as HTMLButtonElement;

    if (chatWindow) {
      chatWindow.classList.add("closing");
      chatWindow.setAttribute("aria-hidden", "true");

      setTimeout(() => {
        chatWindow.classList.remove("open", "closing");
        this.isOpen = false;
      }, 200);
    }

    if (button) {
      button.setAttribute("aria-expanded", "false");
      button.focus();
    }

    storage.setWidgetOpen(this.config.chatbotId, false);
    trackWidgetClose();
    this.emit("close");
  }

  public toggle(): void {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  public sendMessage(message: string): void {
    if (this.isDestroyed || !message.trim()) return;

    const input = this.container?.querySelector(".convoai-input") as HTMLInputElement;
    if (input) {
      input.value = message;
      const form = this.container?.querySelector(".convoai-input-form") as HTMLFormElement;
      form?.dispatchEvent(new Event("submit"));
    }
  }

  public identify(user: UserIdentity): void {
    this.userIdentity = { ...this.userIdentity, ...user };
    storage.setUserIdentity(this.config.chatbotId, this.userIdentity);
  }

  public setLocale(locale: string): void {
    this.config.locale = locale;
    this.translations = getTranslations(locale);
    // Re-render would be needed for full effect
  }

  public clearSession(): void {
    this.sessionId = storage.clearSession(this.config.chatbotId);
    this.conversationId = null;
    this.feedbackSubmitted = false;
    this.messageCount = 0;

    this.messages = [
      {
        role: "assistant",
        content: this.config.welcomeMessage,
        timestamp: new Date(),
      },
    ];
    this.renderMessages();
  }

  public on(event: WidgetEventName, callback: WidgetEventCallback): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback);
  }

  public off(event: WidgetEventName, callback?: WidgetEventCallback): void {
    if (callback) {
      this.eventListeners.get(event)?.delete(callback);
    } else {
      this.eventListeners.delete(event);
    }
  }

  private emit(event: WidgetEventName, data?: unknown): void {
    this.eventListeners.get(event)?.forEach((cb) => {
      try {
        cb(data);
      } catch (e) {
        console.error("ConvoAI: Event handler error", e);
      }
    });
  }

  public destroy(): void {
    this.isDestroyed = true;

    // Clear timers
    this.proactiveTimers.forEach((id) => clearTimeout(id));
    this.proactiveTimers = [];

    // Remove event handlers
    if (this.exitIntentHandler) {
      document.removeEventListener("mouseout", this.exitIntentHandler);
    }

    // Destroy analytics
    analytics.destroy();

    // Remove from DOM
    const host = document.getElementById("convoai-widget-host");
    host?.remove();

    // Clear listeners
    this.eventListeners.clear();
  }

  private incrementUnread(): void {
    this.unreadCount = storage.incrementUnread(this.config.chatbotId);
    this.updateBadge();
  }

  private clearUnread(): void {
    this.unreadCount = 0;
    storage.clearUnread(this.config.chatbotId);
    this.updateBadge();
  }

  private updateBadge(): void {
    const badge = this.container?.querySelector(".convoai-badge");
    if (badge) {
      badge.textContent = this.unreadCount > 0 ? (this.unreadCount > 9 ? "9+" : String(this.unreadCount)) : "";
    }
  }

  // Getters for external access
  public get version(): string {
    return WIDGET_VERSION;
  }

  public get isWidgetOpen(): boolean {
    return this.isOpen;
  }
}
