import { WidgetTranslations } from "../types";
import { en } from "./en";
import { es } from "./es";

const translations: Record<string, WidgetTranslations> = {
  en,
  es,
};

export function getTranslations(locale: string): WidgetTranslations {
  // Try exact match first
  if (translations[locale]) {
    return translations[locale];
  }

  // Try language code only (e.g., "en-US" -> "en")
  const langCode = locale.split("-")[0];
  if (translations[langCode]) {
    return translations[langCode];
  }

  // Default to English
  return translations.en;
}

export function detectLocale(): string {
  if (typeof navigator !== "undefined") {
    return navigator.language || "en";
  }
  return "en";
}

export { en, es };
