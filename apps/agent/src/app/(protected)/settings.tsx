import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { Collapsible } from "react-native-fast-collapsible";
import { fetch } from "expo/fetch";
import Ionicons from "@expo/vector-icons/Ionicons";

import { useMcpClient } from "@/client";
import { toError } from "@/shared/errors";
import usePlatform from "@/hooks/usePlatform";
import useSettings from "@/hooks/useSettings";
import useColors from "@/hooks/useColors";
import Container from "@/components/layout/Container";
import Header from "@/components/layout/Header";
import Page from "@/components/layout/Page";
import Footer from "@/components/layout/Footer";
import ChangePasswordForm from "@/components/forms/ChangePasswordForm";
import { useAlerts } from "@/components/Alerts";
import { useDialog } from "@/components/Dialog";
import McpAutoapproveForm from "@/components/forms/McpAutoaproveForm";
import ProfileDetailsForm from "@/components/forms/ProfileDetailsForm";

const sections = [
  {
    title: "Profile & account details",
    description: "Manage your profile and account settings.",
    Component: () => {
      const { showAlert } = useAlerts();
      const { showDialog } = useDialog();
      const mcp = useMcpClient();
      const token = mcp.token;
      const [profile, setProfile] = useState<{
        firstName: string;
        lastName: string;
        email: string;
      }>();

      const getProfile = useCallback(
        async () =>
          fetch(
            new URL(process.env.EXPO_PUBLIC_MCP_URL + "/profile").toString(),
            { headers: { Authorization: `Bearer ${token}` } },
          )
            .then((r) => r.json())
            .catch((error) => {
              showAlert({
                type: "error",
                title: "Error",
                message: "Failed to fetch profile: " + toError(error).message,
              });
              return undefined;
            }),
        [token, showAlert],
      );

      const submit = useCallback(
        async (data: { firstName: string; lastName: string; email: string }) =>
          fetch(
            new URL(process.env.EXPO_PUBLIC_MCP_URL + "/profile").toString(),
            {
              method: "POST",
              body: JSON.stringify(data),
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
            },
          )
            .then(async (response) => {
              if (!response.ok) {
                const error = await response.json();
                throw new Error(
                  error.error || error.message || "Unknown error",
                );
              }
              setProfile(data);
              showDialog({
                type: "success",
                title: "Email updated successfully",
                message: "",
              });
            })
            .catch((error) => {
              showAlert({
                type: "error",
                title: "Error",
                message: "Failed to update profile: " + toError(error).message,
                timeout: 5000,
              });
            }),
        [token, showAlert, showDialog],
      );

      useEffect(() => {
        getProfile().then(setProfile);
      }, [getProfile]);

      return <ProfileDetailsForm user={profile} onSubmit={submit} />;
    },
  },
  {
    title: "Security",
    description: "Change your password and secure your account.",
    Component: () => {
      const { showAlert } = useAlerts();
      const { showDialog } = useDialog();
      const mcp = useMcpClient();
      const token = mcp.token;

      const submit = useCallback(
        async ({
          newPassword,
          currentPassword,
        }: {
          newPassword: string;
          currentPassword: string;
        }) => {
          try {
            const response = await fetch(
              new URL(
                process.env.EXPO_PUBLIC_MCP_URL + "/change-password",
              ).toString(),
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                  newPassword,
                  currentPassword,
                }),
              },
            );
            const data = await response.json();
            if (data.error) throw new Error(data.error);
            showDialog({
              type: "success",
              title: "Password changed successfully",
              message: "",
            });
          } catch (error) {
            console.error(error);
            showAlert({
              type: "error",
              title: "Failed to change password",
              message: toError(error).message,
            });
            throw error;
          }
        },
        [token, showAlert, showDialog],
      );

      return (
        <ChangePasswordForm
          mode={ChangePasswordForm.Mode.PASSWORD}
          onSubmit={submit}
          showLabels
          cardBackground
        />
      );
    },
  },
  {
    title: "Tools & plugins",
    description: "Manage MCP tools, permissions, and auto-approval.",
    Component: () => {
      const settings = useSettings();
      const { showAlert } = useAlerts();
      const { showDialog } = useDialog();

      const update = useCallback(
        async (autoApprove: boolean, showPanels: boolean) => {
          try {
            await settings.set("autoApproveMcpTools", autoApprove);
            await settings.set("showMcpToolExecutionPanels", showPanels);
            await settings.reload();
            showDialog({
              type: "success",
              title: "Settings applied successfully",
              message: "",
            });
          } catch (error) {
            console.error(error);
            showAlert({
              type: "error",
              title: "Failed to change a setting",
              message: toError(error).message,
            });
          }
        },
        [settings, showAlert, showDialog],
      );

      return (
        <McpAutoapproveForm
          currentAutoApprove={settings.autoApproveMcpTools}
          currentShowPanels={settings.showMcpToolExecutionPanels}
          onSubmit={update}
        />
      );
    },
  },
];

export default function SettingsPage() {
  const mcp = useMcpClient();
  const colors = useColors();
  const { width } = usePlatform();
  const [activeIndex, setActiveIndex] = useState(0);
  const ActiveContent = sections[activeIndex]?.Component || (() => null);

  return (
    <Page>
      <Container>
        <Header handleLogout={mcp.disconnect} />
        {width > 834 ? (
          <View
            style={{
              flex: 1,
              flexDirection: "row",
              gap: 16,
              paddingVertical: 48,
            }}
          >
            <View style={{ flex: 1, gap: 16 }}>
              {sections.map((section, index) => (
                <TouchableOpacity
                  onPress={() => setActiveIndex(index)}
                  disabled={index === activeIndex}
                  key={index}
                  style={[
                    styles.card,
                    { backgroundColor: colors.card },
                    index === activeIndex && {
                      backgroundColor: colors.primary,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.sectionTitle,
                      { color: colors.text },
                      index === activeIndex && { color: colors.primaryText },
                    ]}
                  >
                    {section.title}
                  </Text>
                  <Text
                    style={[
                      styles.sectionDescription,
                      { color: colors.text },
                      index === activeIndex && { color: colors.primaryText },
                    ]}
                  >
                    {section.description}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={{ flex: 1 }}>
              <View
                style={[
                  styles.card,
                  { backgroundColor: colors.card, width: "100%" },
                ]}
              >
                <ActiveContent />
              </View>
            </View>
          </View>
        ) : (
          <ScrollView style={{ flex: 1, paddingVertical: 48 }}>
            {sections.map((section, index) => (
              <View
                key={index}
                style={[
                  styles.card,
                  { backgroundColor: colors.card, marginBottom: 16 },
                ]}
              >
                <TouchableOpacity
                  onPress={() =>
                    setActiveIndex((currentIndex) =>
                      currentIndex === index ? -1 : index,
                    )
                  }
                  style={{ flexDirection: "row" }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>
                      {section.title}
                    </Text>
                    <Text
                      style={[
                        styles.sectionDescription,
                        { color: colors.text },
                        index === activeIndex && { color: colors.primaryText },
                      ]}
                    >
                      {section.description}
                    </Text>
                  </View>
                  <View
                    style={{
                      width: 40,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons
                      name={
                        index === activeIndex ? "chevron-up" : "chevron-down"
                      }
                      size={24}
                      color={colors.text}
                    />
                  </View>
                </TouchableOpacity>
                <Collapsible isVisible={index === activeIndex}>
                  <View style={{ height: 32 }} />
                  <section.Component />
                </Collapsible>
              </View>
            ))}
          </ScrollView>
        )}
        <Footer />
      </Container>
    </Page>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 24,
    overflow: "hidden",
  },
  sectionTitle: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 28,
    lineHeight: 48,
    marginBottom: 8,
  },
  sectionDescription: {
    fontFamily: "Manrope_400Regular",
    fontSize: 16,
    lineHeight: 16,
  },
});
