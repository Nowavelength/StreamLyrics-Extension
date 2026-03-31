/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            fontFamily: {
                'lyrics': ['Figtree', 'Inter', 'sans-serif'],
            },
            colors: {
                'lyrics-bg': '#8B3A3A',
                'lyrics-past': '#FFFFFF',
                'lyrics-future': '#000000',
            },
        },
    },
    plugins: [],
}
