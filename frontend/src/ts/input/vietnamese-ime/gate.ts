import { Config } from "../../config/store";

export function isVietnameseLanguage(language: string): boolean {
  return language === "vietnamese" || language.startsWith("vietnamese_");
}

export function isVietnameseImeSafeModeActive(options?: {
  mode?: typeof Config.vietnameseImeMode;
  inputLanguage?: typeof Config.inputLanguage;
  testLanguage?: typeof Config.language;
}): boolean {
  const mode = options?.mode ?? Config.vietnameseImeMode;
  const inputLanguage = options?.inputLanguage ?? Config.inputLanguage;
  const testLanguage = options?.testLanguage ?? Config.language;

  if (mode !== "native") return false;

  return (
    inputLanguage === "vietnamese" ||
    (inputLanguage === "auto" && isVietnameseLanguage(testLanguage))
  );
}
