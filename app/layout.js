import "./globals.css";

export const metadata = {
  title: "VPS Management Dashboard | Node.js & PM2 Ops",
  description: "Lightweight, secure VPS dashboard for managing Node.js projects, PM2 processes, Git deployments, and server health.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
      </head>
      <body>{children}</body>
    </html>
  );
}
