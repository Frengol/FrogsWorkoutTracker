let pendingProfileSuccessNotice: string | null = null;

export const setProfileSuccessNotice = (message: string) => {
  pendingProfileSuccessNotice = message;
};

export const consumeProfileSuccessNotice = () => {
  const nextMessage = pendingProfileSuccessNotice;
  pendingProfileSuccessNotice = null;
  return nextMessage;
};

export const clearProfileSuccessNotice = () => {
  pendingProfileSuccessNotice = null;
};
