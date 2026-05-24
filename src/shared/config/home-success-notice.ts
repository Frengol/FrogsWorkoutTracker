let pendingHomeSuccessNotice: string | null = null;

export const setHomeSuccessNotice = (message: string) => {
  pendingHomeSuccessNotice = message;
};

export const consumeHomeSuccessNotice = () => {
  const nextMessage = pendingHomeSuccessNotice;
  pendingHomeSuccessNotice = null;
  return nextMessage;
};

export const clearHomeSuccessNotice = () => {
  pendingHomeSuccessNotice = null;
};
