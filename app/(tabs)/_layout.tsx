import { Ionicons } from '@expo/vector-icons';
import { Tabs, router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radii, shadows, spacing, typography } from '@/src/shared/design/tokens';
import { routes } from '@/src/shared/navigation/routes';

const TabBarIcon = ({ name, color }: { name: keyof typeof Ionicons.glyphMap; color: string }) => (
  <Ionicons color={color} size={22} name={name} />
);

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const tabBarPaddingBottom = Math.max(insets.bottom, spacing.md);
  const tabBarHeight = 72 + tabBarPaddingBottom;
  const fabBottom = tabBarHeight + spacing.md;

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.tabInactive,
          tabBarStyle: [styles.tabBar, { height: tabBarHeight, paddingBottom: tabBarPaddingBottom }],
          tabBarLabelStyle: styles.tabLabel,
          tabBarItemStyle: styles.tabItem,
        }}>
        <Tabs.Screen
          name="home"
          options={{
            title: 'Início',
            tabBarIcon: ({ color }) => <TabBarIcon name="home-outline" color={color} />,
          }}
        />
        <Tabs.Screen
          name="library"
          options={{
            title: 'Treinos',
            tabBarIcon: ({ color }) => <TabBarIcon name="grid-outline" color={color} />,
          }}
        />
        <Tabs.Screen
          name="progress"
          options={{
            title: 'Progresso',
            tabBarIcon: ({ color }) => <TabBarIcon name="stats-chart-outline" color={color} />,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Perfil',
            tabBarIcon: ({ color }) => <TabBarIcon name="person-outline" color={color} />,
          }}
        />
      </Tabs>

      <Pressable
        style={[styles.fab, { bottom: fabBottom }]}
        onPress={() => router.push(routes.workout.start())}
        testID="btn-tabs-fab-start-workout">
        <Ionicons name="barbell-outline" size={24} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    paddingTop: spacing.xs,
    backgroundColor: colors.panel,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    shadowColor: colors.shadow,
    shadowOpacity: 0.8,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -6 },
    elevation: 10,
  },
  tabLabel: {
    fontSize: 11,
    fontFamily: typography.bodySemi,
  },
  tabItem: {
    paddingBottom: 2,
  },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    width: 58,
    height: 58,
    borderRadius: radii.lg,
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
});
