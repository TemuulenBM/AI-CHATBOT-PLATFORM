/**
 * ChatAI Widget Types
 */

export interface ChatMessage {
  id?: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date | string;
  type?: "text" | "markdown" | "quick_reply" | "card";
  quickReplies?: string[];
  metadata?: Record<string, unknown>;
}

export interface StoredConversation {
  id?: string;
  messages: Array<{
    role: "user" | "assistant";
    content: string;
    timestamp: string;
  }>;
  created_at: string | null;
}

export interface PreChatField {
  name: string;
  type: "text" | "email" | "phone" | "select";
  label: string;
  placeholder?: string;
  required: boolean;
  options?: string[]; // For select type
}

export interface ProactiveTrigger {
  id: string;
  type: "time_on_page" | "scroll_depth" | "exit_intent" | "page_url";
  value: number | string;
  message: string;
  enabled: boolean;
}

export interface WidgetConfig {
  chatbotId: string;
  primaryColor: string;
  welcomeMessage: string;
  position: "bottom-right" | "bottom-left" | "bottom-center";
  apiUrl: string;
  // New configuration options
  locale?: string;
  cspNonce?: string;
  preChatForm?: {
    enabled: boolean;
    title?: string;
    fields: PreChatField[];
  };
  proactiveTriggers?: ProactiveTrigger[];
  allowedDomains?: string[];
  customCss?: string;
  soundEnabled?: boolean;
  offlineMessage?: string;
  translations?: WidgetTranslations;

  // Advanced customization options
  widgetSize?: "compact" | "standard" | "large";
  borderRadius?: number;
  fontFamily?: string;
  headerStyle?: "solid" | "gradient" | "glass";
  showBranding?: boolean;
  openDelay?: number;
  showInitially?: boolean;
  animationStyle?: "slide" | "fade" | "bounce" | "none";
}

export interface WidgetTranslations {
  placeholder: string;
  sendButton: string;
  poweredBy: string;
  newConversation: string;
  closeChat: string;
  minimizeChat: string;
  preChatTitle: string;
  preChatSubmit: string;
  offlineMessage: string;
  errorMessage: string;
  typingIndicator: string;
  feedbackPrompt: string;
  feedbackThanks: string;
  feedbackYes: string;
  feedbackNo: string;
}

export interface ChatbotInfo {
  id: string;
  name: string;
  settings: {
    primaryColor: string;
    welcomeMessage: string;
    preChatForm?: WidgetConfig["preChatForm"];
    proactiveTriggers?: ProactiveTrigger[];
    allowedDomains?: string[];
    locale?: string;
    // Advanced customization
    position?: "bottom-right" | "bottom-left" | "bottom-center";
    widgetSize?: "compact" | "standard" | "large";
    borderRadius?: number;
    fontFamily?: string;
    headerStyle?: "solid" | "gradient" | "glass";
    showBranding?: boolean;
    openDelay?: number;
    showInitially?: boolean;
    soundEnabled?: boolean;
    animationStyle?: "slide" | "fade" | "bounce" | "none";
  };
  isTraining?: boolean;
}

export interface UserIdentity {
  name?: string;
  email?: string;
  phone?: string;
  userId?: string;
  customData?: Record<string, unknown>;
}

export interface WidgetAnalyticsEvent {
  type: "view" | "open" | "close" | "message_sent" | "message_received" | "first_message" | "feedback" | "prechat_submitted" | "proactive_shown";
  timestamp: number;
  data?: Record<string, unknown>;
}

export interface WidgetError {
  message: string;
  stack?: string;
  url?: string;
  line?: number;
  column?: number;
  timestamp: number;
  widgetVersion: string;
  userAgent: string;
}

// API command types for JavaScript API
export type WidgetCommand =
  | "open"
  | "close"
  | "toggle"
  | "destroy"
  | "sendMessage"
  | "identify"
  | "on"
  | "off"
  | "setLocale"
  | "showProactive";

export type WidgetEventName =
  | "open"
  | "close"
  | "message"
  | "ready"
  | "error"
  | "prechat_submitted"
  | "feedback_submitted";

export type WidgetEventCallback = (data?: unknown) => void;

export interface WidgetAPI {
  (command: "open"): void;
  (command: "close"): void;
  (command: "toggle"): void;
  (command: "destroy"): void;
  (command: "sendMessage", message: string): void;
  (command: "identify", user: UserIdentity): void;
  (command: "on", event: WidgetEventName, callback: WidgetEventCallback): void;
  (command: "off", event: WidgetEventName, callback?: WidgetEventCallback): void;
  (command: "setLocale", locale: string): void;
  (command: "showProactive", message: string): void;
  q?: unknown[];
}
