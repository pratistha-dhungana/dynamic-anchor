/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#08070a',
        night: '#111017',
        panel: '#17151f',
        line: '#2b2635',
        blush: '#ff8ab3',
        roseglass: '#3a1f30',
      },
      boxShadow: {
        glow: '0 0 40px rgba(255, 138, 179, 0.18)',
      },
    },
  },
  plugins: [],
};
