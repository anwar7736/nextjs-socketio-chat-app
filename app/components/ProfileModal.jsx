import React, { useContext, useEffect, useState } from "react";
import ValidationError from "./ValidationError";
import { useForm } from "react-hook-form";
import { toast } from "react-toastify";
import { auth, getImageURL, setAuthProfile, socket_connection } from "../helpers/helper";
import { AuthContext } from "../contexts/AuthContext";
import TwoFactorSettings from "./TwoFactorSettings";
const socket = socket_connection();
const ProfileModal = ({ isOpen, onClose }) => {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm();
  const [preview, setPreview] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [isDisabled, setIsDisabled] = useState(false);
  const { user, setUser } = useContext(AuthContext);

  const profileFormHandler = async (data) => {
    setIsDisabled(true);
    let formData = new FormData();
    formData.append('name', data.name);
    formData.append('phone', data.phone);
    formData.append('address', data.address);
    formData.append('old_password', data.old_password);
    formData.append('password', data.password);
    formData.append('old_photo', auth()?.photo);
    formData.append('photo', photo);
    try {
      let res = await fetch(`api/user/profile/${auth()?._id}`, {
        method: "PUT",
        body: formData
      });

      res = await res.json();
      if (res.success) {
        socket.emit("user-updated", JSON.stringify({
          _id: res.data._id,
          name: res.data.name,
          photo: res.data.photo,
          message: `${user.name} updated their profile.`,
        }));
        setAuthProfile(res.data);
        setUser(auth());
        onClose();
        toast.success(res.message);
      }
      else {
        const message = res.message || "Unable to update your profile.";
        const field = message.toLowerCase().includes("phone")
          ? "phone"
          : message.toLowerCase().includes("old password")
            ? "old_password"
            : message.toLowerCase().includes("password")
              ? "password"
              : message.toLowerCase().includes("photo") || message.toLowerCase().includes("file") || message.toLowerCase().includes("image")
                ? "photo"
                : "name";
        setError(field, { type: "server", message });
      }
    } catch (error) {
      setError("name", { type: "server", message: "Unable to reach the server. Please try again." });
    } finally {
      setIsDisabled(false);
    }
  }

  const handlePhotoChange = (file) => {
    if (!file) {
      setPreview('');
      setPhoto('');
      return;
    }
    setPhoto(file);
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
  }

  useEffect(() => {
    if (!isOpen) return;
    loadData();
  }, [isOpen, user]);

  const loadData = () => {
    setValue("name", user?.name);
    setValue("phone", user?.phone);
    setValue("address", user?.address);
    setPreview(getImageURL(user?.photo));
  }

  if (!isOpen) return null;

  return (
    <div className="print-container fixed inset-0 bg-gray-800 bg-opacity-50 flex items-center justify-center z-50">
      <div className="relative bg-white rounded-lg shadow-lg w-[500px] max-h-[90vh] p-6 overflow-y-auto">
        <button
          type="button" aria-label="Close" className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 no-print"
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


        <form className="bg-white shadow-md rounded px-8 pt-6 pb-8 mb-4" onSubmit={handleSubmit(profileFormHandler)} noValidate>
          <div align="center">
            <h1 className="font-bold">MY PROFILE</h1>
            <div className="w-full max-w-xs">
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
                <input className="shadow appearance-none border border-green-300 rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline mb-1" id="phone" type="text" placeholder="Phone" {...register("phone", { required: 'Provide a valid phone number.', pattern: { value: /^([+]{1}[8]{2}|0088)?(01)[3-9]\d{8}$/, message: "Provide a valid phone number." } })} />
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
                  validate: (value) => {
                    if (value && !watch("password")) return "Enter a new password to change your password.";
                    return !value || value.length >= 4 || "Enter at least 4 characters.";
                  }
                })} />
                {errors?.old_password && <ValidationError message={errors?.old_password?.message} />}
              </div>
              <div className="mb-6">
                <label className="block text-gray-700 text-sm font-bold mb-2 text-start" htmlFor="password">
                  New Password
                </label>
                <input className="shadow appearance-none border border-green-300 rounded w-full py-2 px-3 text-gray-700 mb-1 leading-tight focus:outline-none focus:shadow-outline" id="password" type="password" placeholder="******************" {...register("password", {
                  validate: (value) => {
                    if (value && !watch("old_password")) return "Enter your current password to set a new one.";
                    if (watch("old_password") && value.length < 10) return "Use at least 10 characters.";
                    return value.length <= 128 || "Use no more than 128 characters.";
                  }
                })} />
                {errors?.password && <ValidationError message={errors?.password?.message} />}
              </div>
              <div className="mb-6">
                <label className="block text-gray-700 text-sm font-bold mb-2 text-start" htmlFor="photo">
                  Profile Photo
                </label>
                <input className="shadow appearance-none border border-green-300 rounded w-full py-2 px-3 text-gray-700 mb-1 leading-tight focus:outline-none focus:shadow-outline" id="photo" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(e) => { clearErrors("photo"); handlePhotoChange(e.target.files[0]); }} />
                {errors?.photo && <ValidationError message={errors?.photo?.message} />}
              </div>
              <div className="mb-6">
                <img src={preview} alt="Profile Photo" height={150} width={150} />
              </div>
            </div>
          </div>
          <div className="flex justify-end mt-6 space-x-3">
            <button
              disabled={isDisabled}
              className={`bg-green-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline ${isDisabled ? 'cursor-not-allowed opacity-50' : ''
                }`}
              type="submit">
              Update Now
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-300"
              title="Close"
            >
              Close
            </button>
          </div>
        </form>
        <TwoFactorSettings />
      </div>
    </div>
  );
};

export default ProfileModal;
