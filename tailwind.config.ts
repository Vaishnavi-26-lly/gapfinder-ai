import type { Config } from "tailwindcss";
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: { extend: {
    colors: { ink: "#1B2340", paper: "#F2F4F8", accent: "#3B4CCA", weak: "#C8374D", medium: "#D9962B", strong: "#1F8A70" },
    fontFamily: { display: ["var(--font-display)", "sans-serif"], body: ["var(--font-body)", "sans-serif"] },
  } },
  plugins: [],
} satisfies Config;
