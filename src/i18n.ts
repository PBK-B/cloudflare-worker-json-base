import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import zhTranslation from './locales/zh/translation.json';
import enTranslation from './locales/en/translation.json';

const LANGUAGE_STORAGE_KEY = 'jsonbase-language';

const getStoredLanguage = (): 'zh' | 'en' | null => {
	if (typeof window === 'undefined') {
		return null;
	}

	const storedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);

	return storedLanguage === 'en' || storedLanguage === 'zh' ? storedLanguage : null;
};

const detectLanguage = (): 'zh' | 'en' => {
	const storedLanguage = getStoredLanguage();
	if (storedLanguage) {
		return storedLanguage;
	}

	if (typeof navigator === 'undefined') {
		return 'zh';
	}

	const browserLanguages = [...(Array.isArray(navigator.languages) ? navigator.languages : []), navigator.language].filter(Boolean);

	return browserLanguages.some((language) => language.toLowerCase().startsWith('en')) ? 'en' : 'zh';
};

void i18n.use(initReactI18next).init({
	resources: {
		zh: {
			translation: zhTranslation,
		},
		en: {
			translation: enTranslation,
		},
	},
	lng: detectLanguage(),
	showSupportNotice: false,
	fallbackLng: 'zh',
	defaultNS: 'translation',
	interpolation: {
		escapeValue: false,
	},
});

i18n.on('languageChanged', (language) => {
	if (typeof window === 'undefined') {
		return;
	}

	if (language === 'en' || language === 'zh') {
		window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
	}
});

export default i18n;
