jest.mock('expo-font', () => ({
  useFonts: () => [true],
}));

jest.mock('uuid', () => ({
  v7: jest.fn(() => '00000000-0000-7000-8000-000000000001'),
}));

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve()),
  hideAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  let currentInsets = { top: 0, bottom: 0, left: 0, right: 0 };

  return {
    SafeAreaView: ({ children, ...props }: any) => React.createElement(View, props, children),
    SafeAreaProvider: ({ children }: any) => React.createElement(React.Fragment, null, children),
    useSafeAreaInsets: () => currentInsets,
    __setMockSafeAreaInsets: (nextInsets: Partial<typeof currentInsets>) => {
      currentInsets = { ...currentInsets, ...nextInsets };
    },
    __resetMockSafeAreaInsets: () => {
      currentInsets = { top: 0, bottom: 0, left: 0, right: 0 };
    },
  };
});

jest.mock('@react-navigation/native', () => {
  const React = require('react');

  return {
    DefaultTheme: {
      colors: {
        primary: '#000000',
        background: '#ffffff',
        card: '#ffffff',
        text: '#111111',
        border: '#dddddd',
        notification: '#ff0000',
      },
    },
    ThemeProvider: ({ children }: any) => React.createElement(React.Fragment, null, children),
    useNavigation: jest.fn(),
    useFocusEffect: (effect: () => void | (() => void)) => {
      React.useLayoutEffect(() => {
        const cleanup = effect();
        return typeof cleanup === 'function' ? cleanup : undefined;
      }, [effect]);
    },
  };
});

jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { Text } = require('react-native');

  return {
    Ionicons: ({ name }: any) => React.createElement(Text, { accessibilityLabel: `icon-${name}` }, name),
  };
});

jest.mock('@react-native-community/datetimepicker', () => {
  const React = require('react');
  const { View } = require('react-native');

  const DateTimePicker = ({ testID = 'datetimepicker-stub', onChange, ...props }: any) =>
    React.createElement(View, { testID, onChange, ...props });

  return {
    __esModule: true,
    default: DateTimePicker,
  };
});

jest.mock('react-native-gesture-handler', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    GestureHandlerRootView: ({ children, ...props }: any) => React.createElement(View, props, children),
    Swipeable: ({ children, renderRightActions, testID }: any) =>
      React.createElement(
        View,
        { testID: testID ?? 'swipeable-stub' },
        children,
        typeof renderRightActions === 'function' ? renderRightActions() : null,
      ),
  };
});

jest.mock('expo-router', () => {
  const React = require('react');
  const { Text, View } = require('react-native');

  const router = {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
  };

  const StackComponent = ({ children }: any) => React.createElement(View, { testID: 'stack-router' }, children);
  StackComponent.Screen = () => null;

  const TabsComponent = ({ children }: any) => React.createElement(View, { testID: 'tabs-router' }, children);
  TabsComponent.Screen = () => null;

  return {
    router,
    useRouter: () => router,
    useLocalSearchParams: jest.fn(() => ({})),
    usePathname: jest.fn(() => '/'),
    Redirect: ({ href }: { href: string | { pathname?: string; params?: Record<string, unknown> } }) =>
      React.createElement(
        Text,
        { testID: 'redirect-stub' },
        `redirect:${typeof href === 'string' ? href : JSON.stringify(href)}`,
      ),
    Stack: StackComponent,
    Tabs: TabsComponent,
    Link: ({ children }: any) => React.createElement(React.Fragment, null, children),
  };
});

jest.mock('react-native-draggable-flatlist', () => {
  const React = require('react');
  const { Pressable, View } = require('react-native');

  const renderMaybeNode = (node: any) => {
    if (!node) {
      return null;
    }

    if (React.isValidElement(node)) {
      return node;
    }

    if (typeof node === 'function') {
      return React.createElement(node);
    }

    return null;
  };

  const DraggableFlatList = ({
    data = [],
    renderItem,
    ListHeaderComponent,
    ListFooterComponent,
    ListEmptyComponent,
    onDragEnd,
    testID,
  }: any) =>
    React.createElement(
      View,
      { testID: testID ?? 'draggable-flatlist' },
      renderMaybeNode(ListHeaderComponent),
      data.length === 0
        ? renderMaybeNode(ListEmptyComponent)
        : data.map((item: any, index: number) =>
            React.createElement(
              React.Fragment,
              { key: item?.workoutExercise?.id ?? item?.id ?? String(index) },
              renderItem({
                item,
                getIndex: () => index,
                drag: jest.fn(),
                isActive: false,
              }),
            ),
          ),
      onDragEnd
        ? React.createElement(Pressable, {
            testID: `${testID ?? 'draggable-flatlist'}-drag-end`,
            onPress: () => onDragEnd({ data: [...data].reverse() }),
          })
        : null,
      renderMaybeNode(ListFooterComponent),
    );

  return {
    __esModule: true,
    default: DraggableFlatList,
    ScaleDecorator: ({ children }: any) => React.createElement(React.Fragment, null, children),
  };
});

jest.mock('@/src/shared/design/charts', () => {
  const React = require('react');
  const { Text, View } = require('react-native');

  const createChart = (name: string) =>
    ({ data = [], testID }: { data?: unknown[]; testID?: string }) =>
      React.createElement(
        View,
        { testID: testID ?? `chart-${name}` },
        React.createElement(Text, null, `${name}:${Array.isArray(data) ? data.length : 0}`),
      );

  return {
    BarTrendChart: createChart('bar-trend'),
    DonutBreakdownChart: createChart('donut-breakdown'),
    LineTrendChart: createChart('line-trend'),
  };
});

jest.mock('expo-notifications', () => {
  let permissionsGranted = true;
  let scheduledRequests: Array<{ identifier: string; content: any; trigger: any }> = [];
  let responseListeners = new Set<any>();

  const api = {
    AndroidImportance: {
      HIGH: 'high',
    },
    SchedulableTriggerInputTypes: {
      WEEKLY: 'weekly',
      TIME_INTERVAL: 'timeInterval',
    },
    setNotificationHandler: jest.fn(),
    setNotificationChannelAsync: jest.fn(async () => undefined),
    getPermissionsAsync: jest.fn(async () => ({ granted: permissionsGranted })),
    requestPermissionsAsync: jest.fn(async () => ({ granted: permissionsGranted })),
    scheduleNotificationAsync: jest.fn(async ({ content, trigger }) => {
      const identifier = `notification-${scheduledRequests.length + 1}`;
      scheduledRequests.push({ identifier, content, trigger });
      return identifier;
    }),
    cancelScheduledNotificationAsync: jest.fn(async (identifier: string) => {
      scheduledRequests = scheduledRequests.filter((request) => request.identifier !== identifier);
    }),
    getAllScheduledNotificationsAsync: jest.fn(async () =>
      scheduledRequests.map((request) => ({
        identifier: request.identifier,
        content: request.content,
        trigger: request.trigger,
      })),
    ),
    addNotificationResponseReceivedListener: jest.fn((listener) => {
      responseListeners.add(listener);
      return {
        remove: () => {
          responseListeners.delete(listener);
        },
      };
    }),
    __resetMockNotifications: () => {
      permissionsGranted = true;
      scheduledRequests = [];
      responseListeners = new Set();
    },
    __setPermissionsGranted: (value: boolean) => {
      permissionsGranted = value;
    },
    __getScheduledRequests: () => scheduledRequests,
    __emitResponse: (target: unknown) => {
      responseListeners.forEach((listener) =>
        listener({
          notification: {
            request: {
              content: {
                data: { target },
              },
            },
          },
        }),
      );
    },
  };

  return api;
});

jest.mock('expo-image-picker', () => {
  let libraryPermissionGranted = true;
  let cameraPermissionGranted = true;
  let libraryResult: any = { canceled: true, assets: [] };
  let cameraResult: any = { canceled: true, assets: [] };

  return {
    requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: libraryPermissionGranted })),
    requestCameraPermissionsAsync: jest.fn(async () => ({ granted: cameraPermissionGranted })),
    launchImageLibraryAsync: jest.fn(async () => libraryResult),
    launchCameraAsync: jest.fn(async () => cameraResult),
    __resetMockImagePicker: () => {
      libraryPermissionGranted = true;
      cameraPermissionGranted = true;
      libraryResult = { canceled: true, assets: [] };
      cameraResult = { canceled: true, assets: [] };
    },
    __setLibraryPermissionGranted: (value: boolean) => {
      libraryPermissionGranted = value;
    },
    __setCameraPermissionGranted: (value: boolean) => {
      cameraPermissionGranted = value;
    },
    __setLibraryResult: (value: any) => {
      libraryResult = value;
    },
    __setCameraResult: (value: any) => {
      cameraResult = value;
    },
  };
});

jest.mock('expo-document-picker', () => {
  let documentResult: any = { canceled: true, assets: [] };

  return {
    getDocumentAsync: jest.fn(async () => documentResult),
    __resetMockDocumentPicker: () => {
      documentResult = { canceled: true, assets: [] };
    },
    __setDocumentPickerResult: (value: any) => {
      documentResult = value;
    },
  };
});

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => undefined),
}));

jest.mock('expo-file-system', () => {
  const normalizeUri = (value: string) => {
    if (value.startsWith('file://')) {
      return value.replace(/\/+$/, '');
    }

    return `file:///${value.replace(/^\/+/, '').replace(/\/+$/, '')}`;
  };

  const directories = new Set<string>(['file:///mock-documents']);
  const files = new Map<string, string>();

  const getUri = (entry: unknown) => {
    if (typeof entry === 'string') {
      return entry;
    }

    if (entry && typeof entry === 'object' && 'uri' in entry) {
      return String((entry as { uri: string }).uri);
    }

    return String(entry);
  };

  const joinUri = (...parts: unknown[]) =>
    normalizeUri(
      parts
        .map((part, index) => {
          const raw = getUri(part);
          if (index === 0 && raw.startsWith('file://')) {
            return raw.replace('file://', '');
          }
          return raw;
        })
        .join('/'),
    );

  const getParentUri = (uri: string) => {
    const normalized = normalizeUri(uri);
    const parts = normalized.split('/');

    if (parts.length <= 3) {
      return normalized;
    }

    return parts.slice(0, -1).join('/');
  };

  const ensureDirectory = (uri: string) => {
    const normalized = normalizeUri(uri);
    if (directories.has(normalized)) {
      return;
    }

    const parent = getParentUri(normalized);
    if (parent !== normalized) {
      ensureDirectory(parent);
    }

    directories.add(normalized);
  };

  class File {
    uri: string;

    constructor(first: unknown, second?: unknown) {
      this.uri = second === undefined ? normalizeUri(getUri(first)) : joinUri(first, second);
    }

    get exists() {
      return files.has(this.uri);
    }

    create() {
      ensureDirectory(getParentUri(this.uri));
      if (!files.has(this.uri)) {
        files.set(this.uri, '');
      }
    }

    write(content: string) {
      ensureDirectory(getParentUri(this.uri));
      files.set(this.uri, String(content));
    }

    async text() {
      return files.get(this.uri) ?? '';
    }

    delete() {
      files.delete(this.uri);
    }

    copy(target: { uri: string }) {
      ensureDirectory(getParentUri(target.uri));
      files.set(target.uri, files.get(this.uri) ?? '');
    }

    info() {
      return {
        size: (files.get(this.uri) ?? '').length,
      };
    }
  }

  class Directory {
    uri: string;

    constructor(first: unknown, second?: unknown) {
      this.uri = second === undefined ? normalizeUri(getUri(first)) : joinUri(first, second);
    }

    get exists() {
      return directories.has(this.uri);
    }

    create() {
      ensureDirectory(this.uri);
    }

    delete() {
      const prefix = `${this.uri}/`;
      [...files.keys()]
        .filter((uri) => uri === this.uri || uri.startsWith(prefix))
        .forEach((uri) => files.delete(uri));
      [...directories]
        .filter((uri) => uri === this.uri || uri.startsWith(prefix))
        .forEach((uri) => {
          if (uri !== 'file:///mock-documents') {
            directories.delete(uri);
          }
        });
    }

    list() {
      const prefix = `${this.uri}/`;
      const directChildren = new Map<string, File | Directory>();

      [...directories]
        .filter((uri) => uri.startsWith(prefix) && uri !== this.uri)
        .forEach((uri) => {
          const remainder = uri.slice(prefix.length);
          if (!remainder.includes('/')) {
            directChildren.set(uri, new Directory(uri));
          }
        });

      [...files.keys()]
        .filter((uri) => uri.startsWith(prefix))
        .forEach((uri) => {
          const remainder = uri.slice(prefix.length);
          if (!remainder.includes('/')) {
            directChildren.set(uri, new File(uri));
          }
        });

      return [...directChildren.values()];
    }
  }

  return {
    Directory,
    File,
    Paths: {
      document: 'file:///mock-documents',
    },
    __resetMockFileSystem: () => {
      directories.clear();
      directories.add('file:///mock-documents');
      files.clear();
    },
  };
});

afterEach(() => {
  jest.clearAllMocks();

  const expoRouter = jest.requireMock('expo-router');
  expoRouter.router.push.mockReset();
  expoRouter.router.replace.mockReset();
  expoRouter.router.back.mockReset();
  expoRouter.router.canGoBack.mockReset();
  expoRouter.router.canGoBack.mockReturnValue(true);
  expoRouter.useLocalSearchParams.mockReturnValue({});
  expoRouter.usePathname.mockReturnValue('/');

  jest.requireMock('expo-notifications').__resetMockNotifications();
  jest.requireMock('expo-image-picker').__resetMockImagePicker();
  jest.requireMock('expo-document-picker').__resetMockDocumentPicker();
  jest.requireMock('expo-file-system').__resetMockFileSystem();
});
