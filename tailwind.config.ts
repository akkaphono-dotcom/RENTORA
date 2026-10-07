import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#173F5F",
        secondary: "#20639B",
        accent: "#3CAEA3",
        background: "#F7F9FC",
        muted: "#6B7280",
      },
    },
  },
  plugins: [],
};
export default config;
