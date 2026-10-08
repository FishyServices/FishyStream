import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren
} from "react";
import { applyFishyTheme } from "@fishy/ui";
import { DEFAULT_APP_SETTINGS, type AppSettings } from "@/shared/config/appSettings";
import { readAppSettings, saveAppSettings } from "@/shared/storage/appSettingsStorage";

interface AppSettingsContextValue {
  settings: AppSettings;
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  resetSettings: () => void;
}

const AppSettingsContext = createContext<AppSettingsContextValue | null>(null);

export function AppSettingsProvider({ children }: PropsWithChildren) {
  const [settings, setSettings] = useState<AppSettings>(() => readAppSettings());

  useEffect(() => {
    saveAppSettings(settings);
  }, [settings]);

  useEffect(() => {
    applyFishyTheme({
      mode: settings.theme,
      radius: settings.radius,
      accent: settings.accent
    });
    document.documentElement.style.colorScheme = settings.theme;
  }, [settings.theme, settings.radius, settings.accent]);

  const value = useMemo<AppSettingsContextValue>(
    () => ({
      settings,
      updateSetting: (key, newValue) => {
        setSettings((current) => ({ ...current, [key]: newValue }));
      },
      resetSettings: () => {
        setSettings(DEFAULT_APP_SETTINGS);
      }
    }),
    [settings]
  );

  return <AppSettingsContext.Provider value={value}>{children}</AppSettingsContext.Provider>;
}

export function useAppSettings() {
  const context = useContext(AppSettingsContext);
  if (!context) {
    throw new Error("useAppSettings must be used within AppSettingsProvider");
  }
  return context;
}
