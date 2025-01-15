import { useForm } from "react-hook-form";
import { useRouter } from 'next/navigation'
import ValidationError from "../ValidationError";
import { setCookie } from "cookies-next";
import { toast } from "react-toastify";
import { useContext, useState } from "react";
import { AuthContext } from "@/app/contexts/AuthContext";
import { auth } from "@/app/helpers/helper";
import { UserContext } from "@/app/contexts/UserContext";
import { MessageContext } from "@/app/contexts/MessageContext";
const Login = () => {
    const router = useRouter();
    const { user, setUser } = useContext(AuthContext);
    const { user: selectedUser, setUser: setSelectedUser } = useContext(UserContext);
    const { messages, setMessages } = useContext(MessageContext);
    const [isDisabled, setIsDisabled] = useState(false);
    const {
        register,
        handleSubmit,
        watch,
        formState: { errors },
    } = useForm({
        defaultValues: {
            phone: '01794312241',
            password: '1234'
        }
    });
    const loginFormHandler = async (data) => {
        setIsDisabled(true);
        let formData = new FormData();
        formData.append('phone', data.phone);
        formData.append('password', data.password);
        formData.append('login', 1);
        let res = await fetch("api/user", {
            method: "POST",
            body: formData
        });

        res = await res.json();
        if (res.success) {
            delete res.data.password;
            setCookie('auth', JSON.stringify(res.data));
            setSelectedUser('');
            setMessages([]);
            setUser(auth());
            let redirectUrl = "/";
            router.push(redirectUrl);
            toast.success("Login Successfully");
        }
        else {
            setIsDisabled(false);
            toast.error("Invalid credentials.");
        }


    }
    return (
        <div align="center">
            <h2 className="font-bold">Login</h2>
            <div className="w-full max-w-xs">
                <form className="bg-white shadow-md rounded px-8 pt-6 pb-8 mb-4" onSubmit={handleSubmit(loginFormHandler)}>
                    <div className="mb-4">
                        <label className="block text-gray-700 text-sm font-bold mb-2 text-start" htmlFor="phone">
                            Phone
                        </label>
                        <input className="shadow appearance-none border border-green-300 rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline mb-1" id="phone" type="phone" placeholder="Phone" {...register("phone", { required: 'This field is required' })} />
                        {errors.phone && <ValidationError message={errors.phone.message} />}

                    </div>
                    <div className="mb-6">
                        <label className="block text-gray-700 text-sm font-bold mb-2 text-start" htmlFor="password">
                            Password
                        </label>
                        <input className="shadow appearance-none border border-green-300 rounded w-full py-2 px-3 text-gray-700 mb-1 leading-tight focus:outline-none focus:shadow-outline" id="password" type="password" placeholder="******************" {...register("password", { required: 'This field is required' })} />
                        {errors.password && <ValidationError message={errors.password.message} />}
                    </div>
                    <div className="flex items-center justify-between">
                        <button
                            disabled={isDisabled}
                            className={`bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline ${isDisabled ? 'cursor-not-allowed opacity-50' : ''
                                }`}
                            type="submit"
                        >
                            Login
                        </button>

                        <button className="inline-block align-baseline font-bold text-sm text-blue-500 hover:text-blue-800" type="button">
                            Forgot Password?
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

export default Login