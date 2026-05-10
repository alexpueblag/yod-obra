/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#fafaf7',
        ink: '#1a1a1a',
        'ink-soft': '#5c5c5c',
        line: '#e5e5e0',
        construction: '#d6491a',
        release: '#2d6a4f',
        restriction: '#9a3434',
        warning: '#b8915a',
        info: '#1f4d6b',
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', 'system-ui', 'sans-serif'],
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
}
