/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './providers/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Match the web app's CSS variable palette where it makes sense.
        // RN doesn't read CSS vars, so the canonical colors live here.
        income: '#16a34a',
        expense: '#dc2626',
        accent: '#06b6d4',
      },
    },
  },
  plugins: [],
};
