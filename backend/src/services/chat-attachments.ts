import prisma from './db';

export const MAX_CHAT_IMAGE_BYTES = 5 * 1024 * 1024;
const PREFIX = 'chat-private:';
export const attachmentRef = (id: string) => `${PREFIX}${id}`;
export function attachmentId(ref: string | null | undefined): string | null {
  return ref?.match(/^chat-private:([0-9a-f-]{36})$/i)?.[1] ?? null;
}
// Never return legacy public URLs, local file paths or inline data to clients.
export const visibleChatMedia = (ref: string | null | undefined) => (attachmentId(ref) ? ref : null);

export function decodeChatImage(base64: string, contentType: string): Buffer {
  if (base64.length > Math.ceil(MAX_CHAT_IMAGE_BYTES / 3) * 4) {
    throw new Error('Invalid image or image exceeds 5 MB.');
  }
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.toString('base64') !== base64) throw new Error('Invalid base64 image.');
  const valid =
    contentType === 'image/jpeg'
      ? bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
      : contentType === 'image/png'
        ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : contentType === 'image/webp' &&
          bytes.toString('ascii', 0, 4) === 'RIFF' &&
          bytes.toString('ascii', 8, 12) === 'WEBP';
  if (!valid || !bytes.length || bytes.length > MAX_CHAT_IMAGE_BYTES)
    throw new Error('Invalid image or image exceeds 5 MB.');
  return bytes;
}

export async function canSendAttachment(ref: string, ownerId: string, chatRoomId: string): Promise<boolean> {
  const id = attachmentId(ref);
  return (
    !!id && !!(await prisma.chatAttachment.findFirst({ where: { id, ownerId, chatRoomId }, select: { id: true } }))
  );
}

export async function readAttachment(id: string, userId: string) {
  // Membership is rechecked on every read, including after leaving a room.
  return prisma.chatAttachment.findFirst({
    where: { id, chatRoom: { members: { some: { userId } } } },
    select: { bytes: true, contentType: true },
  });
}
