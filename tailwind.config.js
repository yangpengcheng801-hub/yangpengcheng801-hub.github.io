/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        learn: { bg: '#eef4ff', accent: '#6366f1' },
        review: { bg: '#ecfdf5', accent: '#10b981' },
        wrong: { bg: '#fff7ed', accent: '#f97316' },
        app: {
          bg: '#f2f2f7',
          card: '#ffffff',
          border: 'rgba(60, 60, 67, 0.12)',
        },
      },
      boxShadow: {
        card: '0 4px 24px rgba(15, 23, 42, 0.06)',
        'card-hover': '0 8px 32px rgba(99, 102, 241, 0.14)',
        app: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
        tabbar: '0 -4px 24px rgba(15, 23, 42, 0.06)',
      },
      borderRadius: {
        app: '1.25rem',
        'app-lg': '1.75rem',
      },
    },
  },
  plugins: [],
}
