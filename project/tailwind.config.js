/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bean: '#2B2B29',
        sand: '#E5DCCF',
        off: '#F5F1EA',
        accent: '#A9CAEE',
        slate7g: '#4F5860',
        primary: '#3B82F6',
        gray: {
          750: '#374151',
        },
      },
      backgroundImage: {
        'gradient-dashboard': 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        'gradient-card': 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
      },
    },
  },
  plugins: [],
};