import localFont from "next/font/local";
import "./globals.css";
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import UserContextProvider, { UserWrapper } from "./contexts/UserContext";
import MessageContextProvider from "./contexts/MessageContext";
import AuthContextProvider from "./contexts/AuthContext";
import UserListContextProvider from "./contexts/UserListContext";

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
  title: "Chat Application",
  description: "Nextjs simple chat application",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AuthContextProvider>
          <UserListContextProvider>
            <UserContextProvider>
              <MessageContextProvider>
                {children}
                <ToastContainer />
              </MessageContextProvider>
            </UserContextProvider>
          </UserListContextProvider>
        </AuthContextProvider>
      </body>
    </html>
  );
}
