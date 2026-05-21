/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#130D18',
        night: '#1D1424',
        panel: '#261B31',
        line: '#733D6F',
        blush: '#EA44D4',
        roseglass: '#33265A',
        hibiscus: '#EA44D4',
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
