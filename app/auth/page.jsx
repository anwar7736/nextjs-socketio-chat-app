"use client";

import { useState } from "react";
import Login from "../components/auth/Login";
import SignUp from "../components/auth/SignUp";

export default function AuthPage() {
  const [login, setLogin] = useState(true);

  return (
    <main className="auth-shell">
      <div className="w-full max-w-[470px]">
        {login ? <Login /> : <SignUp />}
        <p className="mt-6 text-center text-sm text-[#91a0b7]">
          {login ? "New to Convo?" : "Already have an account?"}{" "}
          <button
            type="button"
            className="font-semibold text-indigo-300 hover:text-indigo-200"
            onClick={() => setLogin(!login)}
          >
            {login ? "Create an account" : "Sign in"}
          </button>
        </p>
        <p className="mt-8 text-center text-xs text-[#728099]">
          By continuing, you agree to keep your conversations respectful and secure.
        </p>
      </div>
    </main>
  );
}
