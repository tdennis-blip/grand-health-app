import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Carry over the teal-on-slate palette from the prototype.
      },
    },
  },
  plugins: [],
};

export default config;
