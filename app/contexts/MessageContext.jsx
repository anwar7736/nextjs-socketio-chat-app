"use client";
import { createContext, useState } from "react";
export const MessageContext = createContext();
const MessageContextProvider = ({children}) => {
  const [messages, setMessages] = useState('');
  return (
    <MessageContext.Provider value={{messages, setMessages}} >
        {children}
    </MessageContext.Provider>
  )
}

export default MessageContextProvider