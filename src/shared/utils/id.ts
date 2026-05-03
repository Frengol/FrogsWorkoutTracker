let lastTimestamp = 0;
let sequence = 0;

const toHex = (value: number, length = 2) => value.toString(16).padStart(length, '0');

const nextSequence = (timestamp: number) => {
  if (timestamp === lastTimestamp) {
    sequence = (sequence + 1) & 0x0fff;
    return sequence;
  }

  lastTimestamp = timestamp;
  sequence = 0;
  return sequence;
};

const randomByte = () => Math.floor(Math.random() * 256);

const createUuidV7Like = () => {
  const timestamp = Date.now();
  const timestampHex = timestamp.toString(16).padStart(12, '0').slice(-12);
  const sequenceValue = nextSequence(timestamp);
  const randomHex = Array.from({ length: 8 }, () => toHex(randomByte())).join('');
  const variant = (8 + (randomByte() % 4)).toString(16);
  const sequenceHex = sequenceValue.toString(16).padStart(3, '0');

  return [
    timestampHex.slice(0, 8),
    timestampHex.slice(8, 12),
    `7${sequenceHex}`,
    `${variant}${randomHex.slice(0, 3)}`,
    randomHex.slice(3, 15),
  ].join('-');
};

export const createId = () => createUuidV7Like();

export const createDeviceId = () => `device-${createUuidV7Like()}`;
