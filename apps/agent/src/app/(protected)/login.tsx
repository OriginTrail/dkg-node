import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { View } from "react-native";
import * as Linking from "expo-linking";
import * as SplashScreen from "expo-splash-screen";
import { fetch } from "expo/fetch";

import { clientUri, useMcpClient } from "@/client";
import { AuthError, login } from "@/shared/auth";
import Page from "@/components/layout/Page";
import Container from "@/components/layout/Container";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import FormTitle from "@/components/forms/FormTitle";
import LoginForm from "@/components/forms/LoginForm";

const getErrorMessage = (err: any): string => {
  if (!(err instanceof AuthError)) {
    // Check for OAuth-related errors in raw error messages
    const rawMessage = err?.message || String(err);
    return rawMessage;
  }
  switch (err.code) {
    case AuthError.Code.INVALID_CREDENTIALS:
      return "Invalid username or password";
    case AuthError.Code.NO_REDIRECT_URL:
      return "No redirect URL provided";
    case AuthError.Code.INTERNAL_ERROR:
      return "Internal server error";
    default:
      return "Unknown auth error occurred!";
  }
};

// Check if error indicates a stale/invalid authorization code
const isStaleCodeError = (errorMessage: string): boolean => {
  const lowerMessage = errorMessage.toLowerCase();
  return (
    /invalid.*(grant|code|authorization)/i.test(errorMessage) ||
    /authorization.*code/i.test(errorMessage) ||
    /oauth.*client/i.test(errorMessage) ||
    lowerMessage.includes("invalid_grant") ||
    lowerMessage.includes("expired")
  );
};

export default function Login() {
  SplashScreen.hide();
  const { code } = useLocalSearchParams<{ code?: string }>();
  const [validCode, setValidCode] = useState<string | undefined>(code);

  const tryLogin = useCallback(
    async ({
      email,
      password,
      rememberMe,
    }: {
      email: string;
      password: string;
      rememberMe: boolean;
    }) => {
      try {
        const url = await login({
          code: validCode ?? "",
          credentials: { email, password },
          rememberMe,
          fetch: (url, opts) => fetch(url.toString(), opts as any),
        });
        if (url.startsWith(clientUri))
          router.navigate({
            pathname: url.substring(clientUri.length) as any,
          });
        else Linking.openURL(url);
      } catch (error) {
        const errorMessage = getErrorMessage(error);

        // Detect stale authorization code errors
        if (isStaleCodeError(errorMessage)) {
          router.setParams({ code: undefined });
          setValidCode(undefined);
          // Generic message - don't expose OAuth internals
          throw new Error("Your session has expired. Please log in again.");
        }

        throw new Error(errorMessage);
      }
    },
    [validCode],
  );

  const { connected } = useMcpClient();
  if (connected) return <Redirect href="/" />;

  return (
    <Page>
      <Container>
        <Header mode="login" />
        <View
          style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
        >
          <View style={{ width: "100%", maxWidth: 450, padding: 15 }}>
            <FormTitle
              title="Login"
              subtitle="Enter your details to get started."
            />
            <LoginForm onSubmit={tryLogin} />
          </View>
        </View>
        <Footer mode="login" />
      </Container>
    </Page>
  );
}
