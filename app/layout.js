export const metadata = {
  title: "The Night Shift",
  description: "Seven of us. One sleep score a night.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </head>
      <body style={{ margin: 0, background: "#080B14" }}>{children}</body>
    </html>
  );
}
