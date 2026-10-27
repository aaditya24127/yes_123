import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { 50: 'rgb(var(--b50) / <alpha-value>)', 100: 'rgb(var(--b100) / <alpha-value>)', 200: 'rgb(var(--b200) / <alpha-value>)', 300: 'rgb(var(--b300) / <alpha-value>)', 400: 'rgb(var(--b400) / <alpha-value>)', 500: 'rgb(var(--b500) / <alpha-value>)', 600: 'rgb(var(--b600) / <alpha-value>)', 700: 'rgb(var(--b700) / <alpha-value>)', 800: 'rgb(var(--b800) / <alpha-value>)', 900: 'rgb(var(--b900) / <alpha-value>)' },
        ink: { 900: 'rgb(var(--i900) / <alpha-value>)', 700: 'rgb(var(--i700) / <alpha-value>)', 500: 'rgb(var(--i500) / <alpha-value>)', 400: 'rgb(var(--i400) / <alpha-value>)' },
        surface: 'rgb(var(--surface) / <alpha-value>)',
        page: 'rgb(var(--page) / <alpha-value>)',
      },
      boxShadow: {
        float: '0 1px 2px rgba(30,64,175,0.06), 0 8px 24px -8px rgba(37,99,235,0.18)',
        lift: '0 2px 4px rgba(30,64,175,0.08), 0 18px 36px -10px rgba(37,99,235,0.32)',
        panel: '0 24px 60px -12px rgba(15,35,95,0.35)',
      },
      fontFamily: { sans: ['var(--font-sans)', 'Segoe UI', 'sans-serif'], serif: ['var(--font-serif)', 'Georgia', 'serif'] },
    },
  },
  plugins: [],
} satisfies Config;
