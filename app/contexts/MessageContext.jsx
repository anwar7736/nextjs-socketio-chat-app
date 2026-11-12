"use client";
import { createContext, useState } from "react";
export const MessageContext = createContext();
const MessageContextProvider = ({children}) => {
  const [messages, setMessages] = useState([]);
  const [callLogs, setCallLogs] = useState([]);
  // messages being sent from this device (shown at once, replaced by the saved copy); server reloads never touch them
  const [pendingMessages, setPendingMessages] = useState([]);
  return (
    <MessageContext.Provider value={{messages, setMessages, callLogs, setCallLogs, pendingMessages, setPendingMessages}} >
        {children}
    </MessageContext.Provider>
  )
}

export default MessageContextProvider