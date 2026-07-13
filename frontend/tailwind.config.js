/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f4f6fa',
          100: '#e8edf6',
          200: '#c5d3e8',
          300: '#9db4d6',
          400: '#6d8fc0',
          500: '#4f73a5', // Primary brand color
          600: '#3e5c89',
          700: '#334b71',
          800: '#2c3f5e',
          900: '#27364f',
          950: '#1a2334',
        },
        darkBg: '#0b0f19', // Premium deep dark canvas
        darkCard: '#151c2c', // Sleek cards
        darkBorder: '#222d44',
      },
      fontFamily: {
        sans: ['Outfit', 'Inter', 'sans-serif'],
      },
      boxShadow: {
        'premium': '0 4px 20px -2px rgba(0, 0, 0, 0.05), 0 2px 10px -1px rgba(0, 0, 0, 0.03)',
        'premium-dark': '0 4px 20px -2px rgba(0, 0, 0, 0.3), 0 2px 10px -1px rgba(0, 0, 0, 0.2)',
      }
    },
  },
  plugins: [],
}
