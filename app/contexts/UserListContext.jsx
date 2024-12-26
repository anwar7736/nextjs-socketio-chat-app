"use client";
import { createContext, useEffect, useState } from "react";
import { restaurant_auth, user_auth } from "../helpers/helper";
export const UserListContext = createContext();
const UserListContextProvider = ({children}) => {
  const [users, setUsers] = useState('');
  return (
    <UserListContext.Provider value={{users, setUsers}} >
        {children}
    </UserListContext.Provider>
  )
}

export default UserListContextProvider