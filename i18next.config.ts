import { defineConfig } from 'i18next-cli';

export default defineConfig({
	locales: ['zh', 'en'],
	extract: {
		input: ['src/**/*.{ts,tsx}'],
		output: 'src/locales/{{language}}/{{namespace}}.json',
		defaultNS: 'translation',
		primaryLanguage: 'zh',
		secondaryLanguages: ['en'],
	},
});
