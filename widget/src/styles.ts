/**
 * Widget Styles - CSS-in-JS with CSS Custom Properties
 */

import { getMarkdownStyles } from "./utils/markdown";

export function getWidgetStyles(primaryColor: string, position: "bottom-right" | "bottom-left"): string {
  const positionStyles = position === "bottom-right" ? "right: 20px;" : "left: 20px;";
  const windowPosition = position === "bottom-right" ? "right: 0;" : "left: 0;";

  return `
    :host {
      --chatai-primary: ${primaryColor};
      --chatai-primary-dark: ${adjustColor(primaryColor, -20)};
      --chatai-bg: #1a1a2e;
      --chatai-bg-secondary: rgba(0, 0, 0, 0.2);
      --chatai-text: #e5e5e5;
      --chatai-text-muted: rgba(255, 255, 255, 0.4);
      --chatai-border: rgba(255, 255, 255, 0.1);
      --chatai-success: #22c55e;
      --chatai-error: #ef4444;
      --chatai-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
      --chatai-radius: 16px;
      --chatai-font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    .convoai-container {
      position: fixed;
      ${positionStyles}
      bottom: 20px;
      z-index: 2147483647;
      font-family: var(--chatai-font);
      font-size: 14px;
      line-height: 1.5;
      color: var(--chatai-text);
    }

    /* Widget Button */
    .convoai-button {
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: var(--chatai-primary);
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
      transition: transform 0.2s, box-shadow 0.2s;
      position: relative;
    }

    .convoai-button:hover {
      transform: scale(1.05);
      box-shadow: 0 6px 25px rgba(0, 0, 0, 0.3);
    }

    .convoai-button:focus {
      outline: 2px solid var(--chatai-primary);
      outline-offset: 2px;
    }

    .convoai-button svg {
      width: 28px;
      height: 28px;
      fill: white;
    }

    /* Unread Badge */
    .convoai-badge {
      position: absolute;
      top: -4px;
      right: -4px;
      min-width: 20px;
      height: 20px;
      padding: 0 6px;
      background: var(--chatai-error);
      color: white;
      font-size: 12px;
      font-weight: 600;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      animation: chatai-bounce-in 0.3s ease;
    }

    .convoai-badge:empty {
      display: none;
    }

    @keyframes chatai-bounce-in {
      0% { transform: scale(0); }
      50% { transform: scale(1.2); }
      100% { transform: scale(1); }
    }

    /* Chat Window */
    .convoai-window {
      position: absolute;
      ${windowPosition}
      bottom: 75px;
      width: 380px;
      height: 520px;
      background: var(--chatai-bg);
      border-radius: var(--chatai-radius);
      box-shadow: var(--chatai-shadow);
      display: none;
      flex-direction: column;
      overflow: hidden;
      border: 1px solid var(--chatai-border);
    }

    .convoai-window.open {
      display: flex;
      animation: chatai-slide-up 0.3s ease;
    }

    .convoai-window.closing {
      animation: chatai-slide-down 0.2s ease forwards;
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

    @keyframes chatai-slide-down {
      from {
        opacity: 1;
        transform: translateY(0);
      }
      to {
        opacity: 0;
        transform: translateY(20px);
      }
    }

    /* Header */
    .convoai-header {
      background: linear-gradient(135deg, var(--chatai-primary), var(--chatai-primary-dark));
      padding: 16px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .convoai-header-title {
      color: white;
      font-weight: 600;
      font-size: 16px;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .convoai-status-dot {
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

    .convoai-header-actions {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .convoai-header-btn {
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
      color: white;
    }

    .convoai-header-btn:hover {
      background: rgba(255, 255, 255, 0.3);
    }

    .convoai-header-btn:focus {
      outline: 2px solid white;
      outline-offset: 2px;
    }

    .convoai-header-btn svg {
      width: 18px;
      height: 18px;
      stroke: currentColor;
      fill: none;
    }

    .convoai-header-btn.small {
      width: 28px;
      height: 28px;
    }

    .convoai-header-btn.small svg {
      width: 14px;
      height: 14px;
    }

    /* Messages Container */
    .convoai-messages {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      scroll-behavior: smooth;
    }

    .convoai-messages::-webkit-scrollbar {
      width: 6px;
    }

    .convoai-messages::-webkit-scrollbar-track {
      background: transparent;
    }

    .convoai-messages::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.2);
      border-radius: 3px;
    }

    /* Message Bubbles */
    .convoai-message {
      max-width: 85%;
      padding: 12px 16px;
      border-radius: 16px;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }

    .convoai-message.user {
      align-self: flex-end;
      background: var(--chatai-primary);
      color: white;
      border-bottom-right-radius: 4px;
    }

    .convoai-message.assistant {
      align-self: flex-start;
      background: rgba(255, 255, 255, 0.1);
      color: var(--chatai-text);
      border-bottom-left-radius: 4px;
    }

    /* Typing Indicator */
    .convoai-typing {
      display: flex;
      gap: 4px;
      padding: 16px;
      align-self: flex-start;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 16px;
      border-bottom-left-radius: 4px;
    }

    .convoai-typing span {
      width: 8px;
      height: 8px;
      background: rgba(255, 255, 255, 0.4);
      border-radius: 50%;
      animation: chatai-bounce 1.4s infinite ease-in-out;
    }

    .convoai-typing span:nth-child(1) { animation-delay: 0s; }
    .convoai-typing span:nth-child(2) { animation-delay: 0.2s; }
    .convoai-typing span:nth-child(3) { animation-delay: 0.4s; }

    @keyframes chatai-bounce {
      0%, 80%, 100% { transform: translateY(0); }
      40% { transform: translateY(-6px); }
    }

    /* Quick Replies */
    .convoai-quick-replies {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 8px;
    }

    .convoai-quick-reply {
      padding: 8px 16px;
      border: 1px solid var(--chatai-border);
      border-radius: 20px;
      background: transparent;
      color: var(--chatai-text);
      cursor: pointer;
      transition: all 0.2s;
      font-size: 13px;
    }

    .convoai-quick-reply:hover {
      background: var(--chatai-primary);
      border-color: var(--chatai-primary);
    }

    .convoai-quick-reply:focus {
      outline: 2px solid var(--chatai-primary);
      outline-offset: 2px;
    }

    /* Input Container */
    .convoai-input-container {
      padding: 16px;
      background: var(--chatai-bg-secondary);
      border-top: 1px solid var(--chatai-border);
    }

    .convoai-input-form {
      display: flex;
      gap: 10px;
    }

    .convoai-input {
      flex: 1;
      padding: 12px 16px;
      border: 1px solid var(--chatai-border);
      border-radius: 24px;
      background: rgba(255, 255, 255, 0.05);
      color: white;
      font-size: 14px;
      font-family: inherit;
      outline: none;
      transition: border-color 0.2s;
    }

    .convoai-input::placeholder {
      color: var(--chatai-text-muted);
    }

    .convoai-input:focus {
      border-color: var(--chatai-primary);
    }

    .convoai-send-btn {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: var(--chatai-primary);
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.2s, opacity 0.2s;
    }

    .convoai-send-btn:hover:not(:disabled) {
      transform: scale(1.05);
    }

    .convoai-send-btn:focus {
      outline: 2px solid var(--chatai-primary);
      outline-offset: 2px;
    }

    .convoai-send-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .convoai-send-btn svg {
      width: 20px;
      height: 20px;
      fill: white;
    }

    /* Pre-Chat Form */
    .convoai-prechat {
      flex: 1;
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      overflow-y: auto;
    }

    .convoai-prechat-title {
      font-size: 18px;
      font-weight: 600;
      color: white;
      margin-bottom: 8px;
    }

    .convoai-prechat-field {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .convoai-prechat-label {
      font-size: 13px;
      color: var(--chatai-text-muted);
    }

    .convoai-prechat-label .required {
      color: var(--chatai-error);
    }

    .convoai-prechat-input {
      padding: 12px 16px;
      border: 1px solid var(--chatai-border);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.05);
      color: white;
      font-size: 14px;
      font-family: inherit;
      outline: none;
      transition: border-color 0.2s;
    }

    .convoai-prechat-input:focus {
      border-color: var(--chatai-primary);
    }

    .convoai-prechat-input.error {
      border-color: var(--chatai-error);
    }

    .convoai-prechat-submit {
      margin-top: 8px;
      padding: 14px 24px;
      background: var(--chatai-primary);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 15px;
      font-weight: 500;
      cursor: pointer;
      transition: opacity 0.2s;
    }

    .convoai-prechat-submit:hover {
      opacity: 0.9;
    }

    .convoai-prechat-submit:focus {
      outline: 2px solid var(--chatai-primary);
      outline-offset: 2px;
    }

    .convoai-prechat-submit:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* Feedback */
    .convoai-feedback {
      padding: 12px 16px;
      background: rgba(255, 255, 255, 0.05);
      border-top: 1px solid var(--chatai-border);
      text-align: center;
    }

    .convoai-feedback p {
      color: rgba(255, 255, 255, 0.7);
      font-size: 13px;
      margin: 0 0 10px 0;
    }

    .convoai-feedback-buttons {
      display: flex;
      gap: 12px;
      justify-content: center;
    }

    .convoai-feedback-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      border-radius: 20px;
      border: 1px solid var(--chatai-border);
      background: transparent;
      color: rgba(255, 255, 255, 0.8);
      font-size: 13px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .convoai-feedback-btn:hover {
      background: rgba(255, 255, 255, 0.1);
    }

    .convoai-feedback-btn.positive:hover {
      background: rgba(34, 197, 94, 0.2);
      border-color: var(--chatai-success);
      color: var(--chatai-success);
    }

    .convoai-feedback-btn.negative:hover {
      background: rgba(239, 68, 68, 0.2);
      border-color: var(--chatai-error);
      color: var(--chatai-error);
    }

    .convoai-feedback-btn svg {
      width: 16px;
      height: 16px;
    }

    .convoai-feedback-thanks {
      padding: 12px 16px;
      background: rgba(34, 197, 94, 0.1);
      border-top: 1px solid rgba(34, 197, 94, 0.2);
      text-align: center;
      color: var(--chatai-success);
      font-size: 13px;
    }

    /* Powered By */
    .convoai-powered-by {
      text-align: center;
      padding: 8px;
      font-size: 11px;
      color: var(--chatai-text-muted);
      background: var(--chatai-bg-secondary);
    }

    .convoai-powered-by a {
      color: var(--chatai-primary);
      text-decoration: none;
      font-weight: 500;
    }

    .convoai-powered-by a:hover {
      text-decoration: underline;
    }

    /* Proactive Message */
    .convoai-proactive {
      position: absolute;
      ${windowPosition}
      bottom: 80px;
      width: 300px;
      padding: 16px;
      background: var(--chatai-bg);
      border-radius: 12px;
      box-shadow: var(--chatai-shadow);
      border: 1px solid var(--chatai-border);
      animation: chatai-slide-up 0.3s ease;
    }

    .convoai-proactive-message {
      color: var(--chatai-text);
      margin-bottom: 12px;
    }

    .convoai-proactive-actions {
      display: flex;
      gap: 8px;
    }

    .convoai-proactive-btn {
      flex: 1;
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 13px;
      cursor: pointer;
      transition: opacity 0.2s;
    }

    .convoai-proactive-btn.primary {
      background: var(--chatai-primary);
      color: white;
      border: none;
    }

    .convoai-proactive-btn.secondary {
      background: transparent;
      color: var(--chatai-text-muted);
      border: 1px solid var(--chatai-border);
    }

    /* Error State */
    .convoai-error-message {
      padding: 12px 16px;
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.2);
      border-radius: 8px;
      color: var(--chatai-error);
      font-size: 13px;
      margin: 8px 0;
    }

    /* Offline State */
    .convoai-offline {
      padding: 16px;
      text-align: center;
      color: var(--chatai-text-muted);
      font-size: 13px;
    }

    /* Mobile Responsive */
    @media (max-width: 480px) {
      .convoai-window {
        width: calc(100vw - 40px);
        height: calc(100vh - 140px);
        max-height: 500px;
      }

      .convoai-proactive {
        width: calc(100vw - 100px);
      }
    }

    /* Reduced Motion */
    @media (prefers-reduced-motion: reduce) {
      *,
      *::before,
      *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
      }
    }

    /* Focus Visible */
    .convoai-container :focus:not(:focus-visible) {
      outline: none;
    }

    .convoai-container :focus-visible {
      outline: 2px solid var(--chatai-primary);
      outline-offset: 2px;
    }

    /* Screen Reader Only */
    .convoai-sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }

    ${getMarkdownStyles(primaryColor)}
  `;
}

function adjustColor(color: string, amount: number): string {
  const hex = color.replace("#", "");
  const num = parseInt(hex, 16);
  const r = Math.min(255, Math.max(0, (num >> 16) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00ff) + amount));
  const b = Math.min(255, Math.max(0, (num & 0x0000ff) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}
