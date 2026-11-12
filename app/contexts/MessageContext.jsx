"use client";
import { createContext, useState } from "react";
export const MessageContext = createContext();
const MessageContextProvider = ({children}) => {
  const [messages, setMessages] = useState([]);
  const [callLogs, setCallLogs] = useState([]);
  return (
    <MessageContext.Provider value={{messages, setMessages, callLogs, setCallLogs}} >
        {children}
    </MessageContext.Provider>
  )
}

export default MessageContextProvider