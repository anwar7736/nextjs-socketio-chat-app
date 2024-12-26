import React, { useContext, useEffect, useState } from "react";
import ValidationError from "./ValidationError";
import { useForm } from "react-hook-form";
import { toast } from "react-toastify";
import { auth, getImageURL, socket_connection } from "../helpers/helper";
import { setCookie } from "cookies-next";
import { AuthContext } from "../contexts/AuthContext";
const socket = socket_connection();
const ProfileModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null;
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm();
  const [preview, setPreview] = useState(null);
  const [photo, setPhoto] = useState(null);
  const {user, setUser} = useContext(AuthContext);

  const profileFormHandler = async (data) => {
    let formData = new FormData();
    formData.append('name', data.name);
    formData.append('phone', data.phone);
    formData.append('address', data.address);
    formData.append('old_password', data.old_password);
    formData.append('password', data.password);
    formData.append('old_photo', auth()?.photo);
    formData.append('photo', photo);
    let res = await fetch(`api/user/profile/${auth()?._id}`, {
      method: "PUT",
      body: formData
    });

    res = await res.json();
    if (res.success) {
      socket.emit("user-updated", JSON.stringify(res.data));
      setCookie('auth', JSON.stringify(res.data));
      setUser(auth());
      onClose();
      toast.success(res.message);
    }
    else {
      toast.error(res.message);
    }
  }

  const handlePhotoChange = (file) => {
    setPhoto(file);
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
  }

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    setValue("name", user?.name);
    setValue("phone", user?.phone);
    setValue("address", user?.address);
    setPreview(getImageURL(user?.photo));
  }

  return (
    <div className="print-container fixed inset-0 bg-gray-800 bg-opacity-50 flex items-center justify-center z-50">
      <div className="relative bg-white rounded-lg shadow-lg w-[500px] max-h-[90vh] p-6 overflow-y-auto">
        <button
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 no-print"
          onClick={onClose}
          title="Close"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>


        <div align="center">
          <h1 className="font-bold">MY PROFILE</h1>
          <div className="w-full max-w-xs">
            <form className="bg-white shadow-md rounded px-8 pt-6 pb-8 mb-4" onSubmit={handleSubmit(profileFormHandler)}>
              <div className="mb-4">
                <label className="block text-gray-700 text-sm font-bold mb-2 text-start" htmlFor="name">
                  Name
                </label>
                <input className="shadow appearance-none border border-green-300 rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline mb-1" id="name" type="text" placeholder="Name"
                  {...register("name", {
                    required: 'This field is required', minLength: {
                      value: 3,
                      message: 'This should be atleast 3 characters.'
                    }
                  })} />
                {errors?.name && <ValidationError message={errors?.name?.message} />}
              </div>
              <div className="mb-4">
                <label className="block text-gray-700 text-sm font-bold mb-2 text-start" htmlFor="phone">
                  Phone
                </label>
                <input className="shadow appearance-none border border-green-300 rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline mb-1" id="phone" type="text" placeholder="Phone" {...register("phone", { required: 'Provide a valid phone number.', pattern: /^([+]{1}[8]{2}|0088)?(01)[3-9]\d{8}$/ })} />
                {errors?.phone && <ValidationError message={errors?.phone?.message} />}
              </div>
              <div className="mb-4">
                <label className="block text-gray-700 text-sm font-bold mb-2 text-start" htmlFor="address">
                  Address
                </label>
                <textarea className="shadow appearance-none border border-green-300 rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline mb-1" id="address" type="text" placeholder="Address" {...register("address", { required: 'This field is required.' })}></textarea>
                {errors?.address && <ValidationError message={errors?.address?.message} />}
              </div>
              <div className="mb-6">
                <label className="block text-gray-700 text-sm font-bold mb-2 text-start" htmlFor="old_password">
                  Old Password
                </label>
                <input className="shadow appearance-none border border-green-300 rounded w-full py-2 px-3 text-gray-700 mb-1 leading-tight focus:outline-none focus:shadow-outline" id="old_password" type="password" placeholder="******************" {...register("old_password", {
                  required: false,
                  minLength: {
                    value: 4,
                    message: 'Provide atleast 4 digits/characters.'
                  }
                })} />
                {errors?.old_password && <ValidationError message={errors?.old_password?.message} />}
              </div>
              <div className="mb-6">
                <label className="block text-gray-700 text-sm font-bold mb-2 text-start" htmlFor="password">
                  New Password
                </label>
                <input className="shadow appearance-none border border-green-300 rounded w-full py-2 px-3 text-gray-700 mb-1 leading-tight focus:outline-none focus:shadow-outline" id="password" type="password" placeholder="******************" {...register("password", {
                  required: false,
                  minLength: {
                    value: 4,
                    message: 'Provide atleast 4 digits/characters.'
                  }
                })} />
                {errors?.password && <ValidationError message={errors?.password?.message} />}
              </div>
              <div className="mb-6">
                <label className="block text-gray-700 text-sm font-bold mb-2 text-start" htmlFor="photo">
                  Profile Photo
                </label>
                <input className="shadow appearance-none border border-green-300 rounded w-full py-2 px-3 text-gray-700 mb-1 leading-tight focus:outline-none focus:shadow-outline" id="photo" type="file" placeholder="******************" onChange={(e) => handlePhotoChange(e.target.files[0])} />
              </div>
              <div className="mb-6">
                <img src={preview} alt="Profile Photo" height={150} width={150} />
              </div>
              <div className="flex items-center justify-between">
                <button className="bg-green-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline" type="submit">
                  Update Now
                </button>
              </div>
            </form>
          </div>
        </div>

        <div className="flex justify-end mt-6 space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-300"
            title="Close"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProfileModal;
