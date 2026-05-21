/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#F0F2F5',
        night: '#FFFFFF',
        panel: '#F7F8FA',
        line: '#D8DCE3',
        blush: '#EA44D4',
        roseglass: '#EEF0F5',
        hibiscus: '#EA44D4',
        baby: '#F8BBD9',
        flame: '#DD3027',
        aura: '#733D6F',
        indigo: '#5848B3',
      },
      boxShadow: {
        glow: 'none',
      },
    },
  },
  plugins: [],
};
