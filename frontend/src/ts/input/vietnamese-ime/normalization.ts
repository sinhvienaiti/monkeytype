export function normalizeVietnameseCommittedText(value: string): string {
  return value.normalize("NFC");
}
