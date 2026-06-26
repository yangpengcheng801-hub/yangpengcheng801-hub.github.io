/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        space: { 950: '#070b14', 900: '#0a0e1a', 800: '#111827' },
        neon: { blue: '#3b82f6', violet: '#8b5cf6', cyan: '#22d3ee' },
      },
      boxShadow: {
        neon: '0 0 30px rgba(59,130,246,.2)',
        violet: '0 0 30px rgba(139,92,246,.2)',
      },
      backgroundImage: {
        grid: 'linear-gradient(rgba(255,255,255,.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.025) 1px, transparent 1px)',
      },
    },
  },
  plugins: [],
}
