/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        'game-bg': '#0f0f11',
        // ...
      },
    },
  },
  // content: […]  ← you can remove this in v4 with @tailwindcss/vite
}