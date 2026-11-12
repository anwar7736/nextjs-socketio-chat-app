import localFont from "next/font/local";
import "./globals.css";
import { Toaster } from "sonner";
import UserContextProvider, { UserWrapper } from "./contexts/UserContext";
import MessageContextProvider from "./contexts/MessageContext";
import AuthContextProvider from "./contexts/AuthContext";
import UserListContextProvider from "./contexts/UserListContext";
import PwaRegister from "./components/PwaRegister";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata = {
  title: "Convo — Real-time chat",
  description: "Private and group conversations, wherever you are.",
  manifest: "/manifest.json",
  applicationName: "Convo",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Convo",
  },
};

export const viewport = {
  themeColor: "#090d17",
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <PwaRegister />
        <AuthContextProvider>
          <UserListContextProvider>
            <UserContextProvider>
              <MessageContextProvider>
                {children}
                <Toaster
                  position="top-right"
                  theme="dark"
                  richColors
                  closeButton
                  duration={3500}
                  visibleToasts={4}
                  toastOptions={{
                    style: {
                      border: "1px solid #334155",
                      borderRadius: "14px",
                      boxShadow: "0 16px 40px rgb(0 0 0 / 35%)",
                    },
                  }}
                />
              </MessageContextProvider>
            </UserContextProvider>
          </UserListContextProvider>
        </AuthContextProvider>
      </body>
    </html>
  );
}
