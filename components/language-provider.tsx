"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { preferredLanguage, translate, type Language } from "@/lib/i18n";
import { displayTime as formatTime } from "@/lib/time";
const Locale = createContext({
  language: "zh" as Language,
  preference: "zh" as Language,
  setPreference: (_: Language) => {},
  setCoach: (_: boolean) => {},
});
export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [preference, updatePreference] = useState<Language>("zh");
  const [coach, setCoach] = useState(false);
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem("yvonne-language");
    } catch {}
    updatePreference(preferredLanguage(saved, navigator.language));
  }, []);
  const setPreference = useCallback((language: Language) => {
    updatePreference(language);
    try {
      localStorage.setItem("yvonne-language", language);
    } catch {}
  }, []);
  const language = coach ? "zh" : preference;
  useEffect(() => {
    document.documentElement.lang = language === "en" ? "en" : "zh-CN";
  }, [language]);
  const value = useMemo(
    () => ({ language, preference, setPreference, setCoach }),
    [language, preference, setPreference],
  );
  return <Locale.Provider value={value}>{children}</Locale.Provider>;
}
export function useLanguage() {
  const context = useContext(Locale);
  const t = useCallback(
    (text: string | null | undefined, values?: unknown[]) =>
      translate(text, context.language, values),
    [context.language],
  );
  const displayTime = useCallback(
    (value: string, zone: string, format?: string) =>
      formatTime(value, zone, format, context.language),
    [context.language],
  );
  return { ...context, t, displayTime };
}
export function LanguageSelect({
  onChange,
  disabled = false,
}: {
  onChange?: (language: Language) => void;
  disabled?: boolean;
}) {
  const { language, setPreference } = useLanguage();
  return (
    <label className="language-select">
      <span className="sr-only">Language / 语言</span>
      <select
        aria-label="Language / 语言"
        value={language}
        disabled={disabled}
        onChange={(e) =>
          (onChange || setPreference)(e.target.value as Language)
        }
      >
        <option value="zh">中文</option>
        <option value="en">English</option>
      </select>
    </label>
  );
}
