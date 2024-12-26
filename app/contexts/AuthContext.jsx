"use client";
import { createContext, useEffect, useState } from "react";
import { auth } from "../helpers/helper";
export const AuthContext = createContext();
const AuthContextProvider = ({children}) => {
  const [user, setUser] = useState([]);
  useEffect(()=>{
    setUser(auth());
  }, []);
  return (
    <AuthContext.Provider value={{user, setUser}} >
        {children}
    </AuthContext.Provider>
  )
}

export default AuthContextProvider