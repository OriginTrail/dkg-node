import { toError } from "@/shared/errors";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type Settings = {
  autoApproveMcpTools: boolean;
  showMcpToolExecutionPanels: boolean;
};

const defaultSettings: Settings = {
  autoApproveMcpTools: true,
  showMcpToolExecutionPanels: false,
} satisfies Record<string, boolean | string | number | Record<string, unknown>>;

const SettingsContext = createContext<{
  settings: Settings;
  setSettings: (settings: Settings) => void;
}>({
  settings: defaultSettings,
  setSettings: () => {},
});

const KEY_PREFIX = "settings_";

const loadSettings = () =>
  AsyncStorage.multiGet(
    Object.keys(defaultSettings).map((key) => `${KEY_PREFIX}${key}`),
  ).then(
    (keys) =>
      Object.fromEntries(
        keys.map(([k, v]) => {
          const key = k.substring(KEY_PREFIX.length) as keyof Settings;
          return [key, v ? JSON.parse(v) : defaultSettings[key]];
        }),
      ) as Settings,
  );

export function SettingsProvider({
  onLoaded,
  onError,
  children,
}: PropsWithChildren<{
  onLoaded?: () => void;
  onError?: (error: Error) => void;
}>) {
  const [settings, setSettings] = useState(defaultSettings);

  useEffect(() => {
    loadSettings()
      .then(setSettings)
      .then(() => onLoaded?.())
      .catch((error) => onError?.(toError(error)));
  }, [onLoaded, onError]);

  return (
    <SettingsContext.Provider value={{ settings, setSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export default function useSettings(defaults: Partial<Settings> = {}) {
  const { setSettings, settings } = useContext(SettingsContext);

  return useMemo(
    () =>
      Object.assign(settings, {
        reload: async () =>
          loadSettings().then((s) => {
            setSettings(s);
            return s;
          }),
        set: async <T extends keyof Settings>(key: T, value: Settings[T]) =>
          AsyncStorage.setItem(`${KEY_PREFIX}${key}`, JSON.stringify(value)),
        get: async <T extends keyof Settings>(key: T): Promise<Settings[T]> =>
          AsyncStorage.getItem(`${KEY_PREFIX}${key}`).then((value) => {
            if (value === null) return { ...defaultSettings, ...defaults }[key];
            return JSON.parse(value);
          }),
      }),
    [settings, setSettings, defaults],
  );
}
