import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import expressiveCode from "astro-expressive-code";

// https://astro.build/config
export default defineConfig({
	site: 'https://redactedontop.github.io',
	integrations: [sitemap(), expressiveCode({
		tabWidth: 4,
		styleOverrides: {
			codeFontSize: '1rem'
		}
	})]
});