import React from 'react';
import type * as ReactNative from 'react-native';

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

export const createMockFlatList = (actual: typeof ReactNative) => {
  const FlatList = ({
    contentContainerStyle,
    data = [],
    keyExtractor,
    ItemSeparatorComponent,
    ListEmptyComponent,
    ListFooterComponent,
    ListHeaderComponent,
    onEndReached,
    renderItem,
    style,
    testID,
  }: any) => {
    const resolvedTestID = testID ?? 'flat-list';
    const listItems =
      data.length === 0
        ? renderMaybeNode(ListEmptyComponent)
        : data.flatMap((item: any, index: number) => {
            const key = keyExtractor ? keyExtractor(item, index) : item?.id ?? String(index);
            const separator =
              ItemSeparatorComponent && index < data.length - 1
                ? React.createElement(ItemSeparatorComponent, { key: `${key}-separator` })
                : null;

            return [
              React.createElement(
                React.Fragment,
                { key },
                renderItem({
                  item,
                  index,
                  separators: {
                    highlight: jest.fn(),
                    unhighlight: jest.fn(),
                    updateProps: jest.fn(),
                  },
                }),
              ),
              separator,
            ].filter(Boolean);
          });

    return React.createElement(
      actual.View,
      { style, testID: resolvedTestID },
      React.createElement(
        actual.View,
        { style: contentContainerStyle },
        renderMaybeNode(ListHeaderComponent),
        listItems,
        renderMaybeNode(ListFooterComponent),
        onEndReached
          ? React.createElement(actual.Pressable, {
              accessibilityRole: 'button',
              accessibilityLabel: 'Carregar mais itens',
              onPress: () => onEndReached({ distanceFromEnd: 0 }),
              testID: `${resolvedTestID}-on-end-reached`,
            })
          : null,
      ),
    );
  };

  return FlatList;
};
