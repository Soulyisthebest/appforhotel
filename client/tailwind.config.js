export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: '#1a2640', 2: '#243352', 3: '#2d3f63' },
        accent: { DEFAULT: '#4a9fd4', 2: '#3a7fb5' },
        gold: '#d4a843'
      }
    }
  },
  plugins: []
}
