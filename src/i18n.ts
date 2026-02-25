import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import zhTranslation from './locales/zh/translation.json';
import enTranslation from './locales/en/translation.json';

const detectLanguage = (): 'zh' | 'en' => {
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

export default i18n;
