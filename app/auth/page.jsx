"use client";
import { useState } from "react";
import Login from "../components/auth/Login";
import SignUp from "../components/auth/SignUp";

const User = () => {
    const [login, setLogin] = useState(true);
  return (
    <div className="mt-4">
        <title>Login/Signup</title>
        {
            login ? <Login/> : <SignUp/>
        }
        
        <div align="center">
            <button className="text-red-500" onClick={()=>setLogin(!login)}>
                {
                    login ? 'Not yet a registered? Register' : 'Already have an account? Login'
                }
            </button>
        </div>
    </div>
  )
}

export default User