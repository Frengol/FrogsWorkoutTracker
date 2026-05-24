let pendingLibrarySuccessNotice: string | null = null;

export const setLibrarySuccessNotice = (message: string) => {
  pendingLibrarySuccessNotice = message;
};

export const consumeLibrarySuccessNotice = () => {
  const nextMessage = pendingLibrarySuccessNotice;
  pendingLibrarySuccessNotice = null;
  return nextMessage;
};

export const clearLibrarySuccessNotice = () => {
  pendingLibrarySuccessNotice = null;
};
