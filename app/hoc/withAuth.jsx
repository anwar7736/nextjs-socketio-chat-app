"use client";
import { redirect} from "next/navigation";
import { isAuth } from "../helpers/helper";

const withAuth = (WrappedComponent) => {
  return function AuthComponent(props) {
    const status = isAuth();
    if (!status)
    {
        redirect('/auth');
    }

    return <WrappedComponent {...props} />;
  };
};

export default withAuth;
