/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Material Design 3 semantic tokens (from Stitch designs)
        primary: {
          DEFAULT: '#3525cd',
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
        'primary-container': '#4f46e5',
        'on-primary': '#ffffff',
        'on-primary-fixed': '#0f0069',
        'on-primary-fixed-variant': '#3323cc',
        'inverse-primary': '#c3c0ff',

        // Surface system
        surface: {
          DEFAULT: '#f7f9fb',
          dim: '#d8dadc',
          bright: '#f7f9fb',
        },
        'surface-container': {
          DEFAULT: '#eceef0',
          lowest: '#ffffff',
          low: '#f2f4f6',
          high: '#e6e8ea',
          highest: '#e4e2e2',
        },
        'surface-variant': '#e0e3e5',
        'surface-tint': '#4d44e3',
        'on-surface': '#191c1e',
        'on-surface-variant': '#464555',
        'inverse-surface': '#2d3133',
        'inverse-on-surface': '#eff1f3',

        // Secondary
        secondary: '#5d5b7f',
        'secondary-container': '#d7d3fe',
        'on-secondary': '#ffffff',

        // Tertiary
        'tertiary-container': '#a44100',
        'on-tertiary-container': '#ffd2be',

        // Error
        error: '#ba1a1a',
        'error-container': '#ffdad6',
        'on-error': '#ffffff',
        'on-error-container': '#93000a',

        // Outline
        outline: '#777587',
        'outline-variant': '#c7c4d8',

        // İKÜ brand palette — red / black / silver university identity
        iku: {
          red: '#ED1C24',
          'red-dark': '#C41820',
          black: '#1A1A1A',
          charcoal: '#2A2A2A',
          silver: '#BFBFBF',
          surface: '#F7F7F7',
        },

        // Legacy compat
        navy: {
          DEFAULT: '#1E1B4B',
          light: '#2D2A68',
          dark: '#141240',
        },
        page: '#F8F9FC',
      },
      fontFamily: {
        sans:     ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        headline: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono:     ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
        // Legacy compat
        jakarta:  ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        // Handwriting fonts for mock scan rendering (teacher review workspace)
        caveat:   ['"Caveat"', 'cursive'],
        kalam:    ['"Kalam"', 'cursive'],
        patrick:  ['"Patrick Hand"', 'cursive'],
      },
      boxShadow: {
        card:    '0 12px 40px rgba(15,0,105,0.04)',
        modal:   '0 20px 60px -10px rgba(0,0,0,0.25)',
        subtle:  '0 1px 3px 0 rgba(0,0,0,0.07), 0 1px 2px -1px rgba(0,0,0,0.05)',
      },
      borderRadius: {
        DEFAULT: '0.25rem',
        lg: '0.5rem',
        xl: '0.75rem',
        '2xl': '1rem',
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
