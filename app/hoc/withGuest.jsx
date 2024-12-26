"use client";
import { redirect} from "next/navigation";
import { isAuth } from "../helpers/helper";

const withGuest = (WrappedComponent) => {
  return function GuestComponent(props) {
    const status = isAuth();
    if (status)
    {
        redirect('/');
    }

    return <WrappedComponent {...props} />;
  };
};

export default withGuest;
