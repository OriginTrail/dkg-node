import { useCallback, useEffect, useRef, useState } from "react";
import { router, Slot, useGlobalSearchParams, usePathname } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { McpContextProvider } from "@/client";
import { useAlerts } from "@/components/Alerts";
import { SettingsProvider } from "@/hooks/useSettings";

const REDIRECT_COUNT_KEY = "oauth_redirect_count";
const MAX_REDIRECTS = 3;

const getRedirectCount = async (): Promise<number> => {
  const count = await AsyncStorage.getItem(REDIRECT_COUNT_KEY);
  return count ? parseInt(count, 10) : 0;
};

const incrementRedirectCount = async (): Promise<number> => {
  const newCount = (await getRedirectCount()) + 1;
  await AsyncStorage.setItem(REDIRECT_COUNT_KEY, newCount.toString());
  return newCount;
};

const resetRedirectCount = async (): Promise<void> => {
  await AsyncStorage.removeItem(REDIRECT_COUNT_KEY);
};

export default function ProtectedLayout() {
  const params = useGlobalSearchParams<{ code?: string; error?: string }>();
  const { showAlert } = useAlerts();

  const [idleMcp, setIdleMcp] = useState(false);
  const [idleSettings, setIdleSettings] = useState(false);
  const isHandlingError = useRef(false);

  const mcpCallback = useCallback(
    (error?: Error) => {
      setIdleMcp(true);
      router.setParams({ code: undefined }); // Always clear code param

      if (!error) {
        // Success - reset redirect count
        resetRedirectCount();
        return;
      }

      // Prevent concurrent error handling
      if (isHandlingError.current) return;
      isHandlingError.current = true;

      // Check if this is an auth-related error requiring re-authentication
      const errorMessage = error.message.toLowerCase();
      const isAuthError =
        errorMessage.includes("invalid_grant") ||
        errorMessage.includes("invalid grant") ||
        errorMessage.includes("invalid token") ||
        errorMessage.includes("authorization code") ||
        errorMessage.includes("oauth client") ||
        errorMessage.includes("unauthorized");

      if (isAuthError) {
        // Auto-redirect with loop protection
        (async () => {
          try {
            const redirectCount = await incrementRedirectCount();
            if (redirectCount > MAX_REDIRECTS) {
              await resetRedirectCount();
              showAlert({
                type: "error",
                title: "Authentication Failed",
                message:
                  "Unable to authenticate. Please try again later or contact support.",
                timeout: 10000,
              });
              isHandlingError.current = false;
              return;
            }
            router.replace("/");
          } catch {
            isHandlingError.current = false;
          }
        })();
        return;
      }

      // For other errors, show alert
      showAlert({
        type: "error",
        title: "Connection Error",
        message: error.message,
        timeout: 5000,
      });
      isHandlingError.current = false;
    },
    [showAlert],
  );

  const errorCode = params.error;
  useEffect(() => {
    if (errorCode)
      mcpCallback(
        new Error(
          `Connection to the MCP Server failed with error code: "${errorCode}"\n` +
            "Try cleaning localStorage and going to the login page.",
        ),
      );
  }, [errorCode, mcpCallback]);

  const isLoginFlow = usePathname() === "/login" && !!params.code;

  const settingsCallback = useCallback(
    (error?: Error) => {
      setIdleSettings(true);

      if (error)
        showAlert({
          type: "error",
          title: "Settings Error",
          message: error.message,
          timeout: 5000,
        });
    },
    [showAlert],
  );

  useEffect(() => {
    if (idleMcp && idleSettings) SplashScreen.hide();
  }, [idleMcp, idleSettings]);

  return (
    <SettingsProvider onLoaded={settingsCallback} onError={settingsCallback}>
      <McpContextProvider
        autoconnect={
          errorCode || isLoginFlow
            ? false
            : {
                authorizationCode: params.code,
                callback: mcpCallback,
              }
        }
        onMcpError={mcpCallback}
      >
        <Slot />
      </McpContextProvider>
    </SettingsProvider>
  );
}
