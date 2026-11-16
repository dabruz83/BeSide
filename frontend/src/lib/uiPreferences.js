import { createContext, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEYS = {
  theme: "beside.theme",
  mobileNavLabels: "beside.mobileNavLabels",
  textScale: "beside.textScale",
};

const defaults = { theme: "light", mobileNavLabels: true, textScale: "normal" };
const read = (key, fallback) => {
  try {
    const value = localStorage.getItem(STORAGE_KEYS[key]);
    return value === null ? fallback : value;
  } catch { return fallback; }
};

export const UiPreferencesContext = createContext(null);

export const UiPreferencesProvider = ({ children }) => {
  const [preferences, setPreferences] = useState(() => ({
    theme: read("theme", defaults.theme),
    mobileNavLabels: read("mobileNavLabels", "true") !== "false",
    textScale: read("textScale", defaults.textScale),
  }));

  useEffect(() => {
    const apply = (next) => {
      const root = document.documentElement;
      const systemDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
      root.classList.toggle("dark", next.theme === "dark" || (next.theme === "system" && systemDark));
      root.dataset.textScale = next.textScale;
      root.style.setProperty("--beside-text-scale", next.textScale === "large" ? "1.08" : next.textScale === "xlarge" ? "1.16" : "1");
    };
    apply(preferences);
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    const onSystemChange = () => { if (preferences.theme === "system") apply(preferences); };
    media?.addEventListener?.("change", onSystemChange);
    return () => media?.removeEventListener?.("change", onSystemChange);
  }, [preferences]);

  const update = (key, value) => {
    const next = { ...preferences, [key]: value };
    setPreferences(next);
    try { localStorage.setItem(STORAGE_KEYS[key], key === "mobileNavLabels" ? String(value) : value); } catch { /* storage non disponibile */ }
    window.dispatchEvent(new CustomEvent("beside:ui-preferences", { detail: next }));
  };

  const value = useMemo(() => ({ preferences, update }), [preferences]);
  return <UiPreferencesContext.Provider value={value}>{children}</UiPreferencesContext.Provider>;
};

export const useUiPreferences = () => {
  const context = useContext(UiPreferencesContext);
  if (!context) throw new Error("useUiPreferences must be used within UiPreferencesProvider");
  return context;
};
