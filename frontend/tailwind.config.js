/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50:  '#EEF2FF',
          100: '#E0E7FF',
          200: '#C7D2FE',
          300: '#A5B4FC',
          400: '#818CF8',
          500: '#6366F1',
          600: '#4F46E5',
          700: '#4338CA',
          800: '#3730A3',
          900: '#312E81',
          950: '#1E1B4B',
        },
        navy: {
          DEFAULT: '#1E1B4B',
          light:   '#2D2A68',
          dark:    '#141240',
        },
        page: '#F8F9FC',
      },
      fontFamily: {
        jakarta: ['"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans:    ['"DM Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono:    ['"DM Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        card:  '0 1px 3px 0 rgba(0,0,0,0.07), 0 1px 2px -1px rgba(0,0,0,0.05)',
        modal: '0 20px 60px -10px rgba(0,0,0,0.25)',
      },
      keyframes: {
        'slide-in-right': {
          from: { transform: 'translateX(110%)', opacity: '0' },
          to:   { transform: 'translateX(0)',    opacity: '1' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'slide-in-right': 'slide-in-right 0.3s ease-out',
        'fade-up':        'fade-up 0.35s ease-out',
      },
    },
  },
  plugins: [],
};
