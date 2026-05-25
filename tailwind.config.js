/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: 'var(--brand-primary)',
        accent: 'var(--brand-accent)',
      },
    },
  },
  plugins: [],
};
