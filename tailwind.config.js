/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './*.html',
    './*.js',
    './js/**/*.js',
    './services/**/*.js'
  ],
  theme: {
    extend: {
      colors: {
        grafito: { DEFAULT: '#1f2937', oscuro: '#111827', claro: '#374151' },
      },
      borderRadius: {
        hdv: '0.75rem',
      },
      boxShadow: {
        'hdv-card': '0 1px 3px 0 rgba(0,0,0,0.08), 0 1px 2px -1px rgba(0,0,0,0.06)',
        'hdv-elevated': '0 4px 12px rgba(0,0,0,0.1)',
      },
    },
  },
  plugins: [],
}
