import 'telegraf';

declare module 'telegraf' {
  interface Context {
    i18n: {
      locale(): string;
      locale(next: string): void;
      t(key: string, vars?: Record<string, unknown>): string;
      middleware(): any;
    };
  }
}
