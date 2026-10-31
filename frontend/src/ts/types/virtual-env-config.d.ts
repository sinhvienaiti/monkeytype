export type EnvConfig = {
  backendUrl: string;
  isDevelopment: boolean;
  clientVersion: string;
  recaptchaSiteKey: string;
  quickLoginEmail: string | undefined;
  quickLoginPassword: string | undefined;
  /** Typing Feel root (TYPING_FEEL_URL); undefined: Typing Feel off. */
  typingFeelUrl: string | undefined;
};

declare module "virtual:env-config" {
  export const envConfig: EnvConfig;
}
