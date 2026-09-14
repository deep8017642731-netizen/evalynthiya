export type DetectedLang = 'bn' | 'hi' | 'en' | 'mixed';

export function detectLanguage(text: string): {
  code: DetectedLang;
  label: string;
  speechCode: string;
  nativeName: string;
} {
  if (!text || !text.trim()) {
    return {
      code: 'en',
      label: 'English',
      speechCode: 'en-IN',
      nativeName: 'English',
    };
  }

  const bnRegex = /[\u0980-\u09FF]/;
  const hiRegex = /[\u0900-\u097F]/;
  const enRegex = /[a-zA-Z]/;

  const hasBn = bnRegex.test(text);
  const hasHi = hiRegex.test(text);
  const hasEn = enRegex.test(text);

  if (hasBn && hasEn) {
    return {
      code: 'mixed',
      label: 'Bengali + English',
      speechCode: 'bn-IN',
      nativeName: 'বাংলা + English',
    };
  }

  if (hasHi && hasEn) {
    return {
      code: 'mixed',
      label: 'Hindi + English',
      speechCode: 'hi-IN',
      nativeName: 'हिन्दी + English',
    };
  }

  if (hasBn) {
    return {
      code: 'bn',
      label: 'Bengali',
      speechCode: 'bn-IN',
      nativeName: 'বাংলা',
    };
  }

  if (hasHi) {
    return {
      code: 'hi',
      label: 'Hindi',
      speechCode: 'hi-IN',
      nativeName: 'हिन्दी',
    };
  }

  return {
    code: 'en',
    label: 'English',
    speechCode: 'en-IN',
    nativeName: 'English',
  };
}

export const SUPPORTED_LANGUAGES = [
  { id: 'auto', name: 'Auto Detect', native: 'স্বয়ংক্রিয় / स्वचालित / Auto' },
  { id: 'en', name: 'English', native: 'English (Indian context)' },
  { id: 'bn', name: 'Bengali', native: 'বাংলা (কলকাতা)' },
  { id: 'hi', name: 'Hindi', native: 'हिन्दी (भारत)' },
] as const;
