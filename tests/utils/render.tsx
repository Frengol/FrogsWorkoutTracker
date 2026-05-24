import { ReactElement } from 'react';
import { render } from '@testing-library/react-native';

import { AppDialogProvider } from '@/src/shared/design/app-dialog';

export const renderScreen = (ui: ReactElement) => render(<AppDialogProvider>{ui}</AppDialogProvider>);

export * from '@testing-library/react-native';
