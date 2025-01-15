import { useContext, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "react-toastify";
import { AuthContext } from "../contexts/AuthContext";
import { MessageContext } from "../contexts/MessageContext";
import { UserContext } from "../contexts/UserContext";
import { UserListContext } from "../contexts/UserListContext";
import {
  dateFormat,
  dateTimeFormat,
  getImageURL,
  socket_connection,
} from "../helpers/helper";
import ValidationError from "./ValidationError";
import Swal from "sweetalert2";
const socket = socket_connection();
const GroupEditOrViewModal = ({ isOpen, onClose, data }) => {
  if (!isOpen) return null;
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm();
  const [preview, setPreview] = useState("");
  const [photo, setPhoto] = useState("");
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [parent, setParent] = useState(false);
  const [isDisabled, setIsDisabled] = useState(false);
  const { user, setUser } = useContext(AuthContext);
  const { user: selectedUser, setUser: setSelectedUser } =
    useContext(UserContext);
  const { users: userList, setUsers: setUserList } =
    useContext(UserListContext);
  const { messages, setMessages } = useContext(MessageContext);

  const editGroupFormHandler = async (input) => {
    setIsDisabled(true);
    const filteredUsers = users.filter((user) => user?.is_checked);
    if (filteredUsers.length === 0) {
      toast.error("Please choose atleast one member!");
      setIsDisabled(false);
      return;
    }
    const adminUsers = filteredUsers.filter((user) => user?.is_admin);
    if (adminUsers.length === 0) {
      toast.error("Please choose atleast one admin!");
      setIsDisabled(false);
      return;
    }

    const groupMembers = filteredUsers.map(({ user_id, is_admin }) => ({
      user_id,
      is_admin,
    }));

    let formData = new FormData();
    formData.append("group_id", data._id);
    formData.append("name", input.name);
    formData.append("short_desc", input.short_desc);
    formData.append("photo", photo);
    formData.append("old_photo", data.photo);
    formData.append("group_members", JSON.stringify(groupMembers));
    formData.append("created_by", JSON.stringify(user?._id));
    formData.append("creator", JSON.stringify(user?.name));
    let res = await fetch("api/group", {
      method: "PUT",
      body: formData,
    });

    res = await res.json();
    if (res.success) {
      setSelectedUser({
        ...selectedUser,
        total_members: res?.data?.total_members,
      });
      toast.success(res.message);
      socket.emit("update-group", JSON.stringify(res.data));
      onClose();
    } else {
      setIsDisabled(false);
      toast.error(res.message);
    }
  };

  const handleLeaveGroup = async () => {
    setIsDisabled(true);
    if (data?.is_admin) {
      const adminUsers = users.filter(
        (u) => u?.is_checked && u?.is_admin && u?.user_id !== user?._id
      );
      if (adminUsers.length === 0) {
        toast.error("Please choose atleast one admin!");
        setIsDisabled(false);
        return;
      }
    }

    Swal.fire({
      title: "Are you sure?",
      text: "You won't be able to leave this group!",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#3085d6",
      cancelButtonColor: "#d33",
      confirmButtonText: "Yes",
      cancelButtonText: "No"
    }).then(async (result) => {
      if (result.isConfirmed) {
        let res = await fetch(`api/group`, {
          method: "PATCH",
          body: JSON.stringify({ group_id: data._id, user_id: user?._id }),
        });

        res = await res.json();
        if (res.success) {
          let newUsers = userList.filter((user) => user._id !== data?._id);
          setUserList(newUsers);
          setSelectedUser("");
          setMessages([]);
          toast.success(`You are left from "${data.name}"`);
          const response = {
            _id: data._id,
            user_id: user._id,
            message: `${user.name} left from "${data.name}"`,
            groupMembers: res?.groupMembers,
          };
          socket.emit("leave-group", JSON.stringify(response));
          onClose();
        } else {
          setIsDisabled(false);
          toast.error(res.message);
        }

      }
    });
    setIsDisabled(false);
  };

  const handleDeleteGroup = async () => {
    setIsDisabled(true);
    Swal.fire({
      title: "Are you sure?",
      text: "You won't be able to delete this group!",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#3085d6",
      cancelButtonColor: "#d33",
      confirmButtonText: "Yes",
      cancelButtonText: "No"
    }).then(async (result) => {
      if (result.isConfirmed) {
        let res = await fetch(`api/group?id=${data?._id}`, {
          method: "DELETE",
        });

        res = await res.json();
        if (res.success) {
          let newUsers = userList.filter((user) => user._id !== data?._id);
          setUserList(newUsers);
          setSelectedUser("");
          setMessages([]);
          toast.success(res.message);
          const response = {
            _id: data._id,
            deleted_by: user._id,
            message: `"${data?.name}" deleted by ${user.name}`,
            groupMembers: res.groupMembers,
          };
          socket.emit("delete-group", JSON.stringify(response));
          onClose();
        } else {
          setIsDisabled(false);
          toast.error(res.message);
        }

      }
    });
    setIsDisabled(false);
  };

  const handlePhotoChange = (file) => {
    if (!file) {
      setPreview("");
      setPhoto("");
      return;
    }
    setPhoto(file);
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
  };

  const handleParentChange = (is_checked) => {
    setParent(is_checked);
    const updatedUsers = users.map((user) => ({ ...user, is_checked }));
    setUsers(updatedUsers);
  };

  const handleChildChange = (user_id) => {
    const updatedUsers = users.map((user) =>
      user?.user_id === user_id
        ? { ...user, is_checked: !user?.is_checked }
        : user
    );

    setUsers(updatedUsers);

    const is_checked = updatedUsers.every((user) => user?.is_checked);
    setParent(is_checked);
  };

  const handleAdminChange = (user_id) => {
    const updatedUsers = users.map((user) =>
      user?.user_id === user_id ? { ...user, is_admin: !user?.is_admin } : user
    );

    setUsers(updatedUsers);
  };

  useEffect(() => {
    loadUsers();
  }, [search, data]);

  const loadUsers = async () => {
    let res = await fetch(`api/users/list?search=${search}`);
    res = await res.json();
    if (res.success) {
      let updatedUsers = [];
      if (data?.is_admin) {
        updatedUsers = res.data.map((user) => ({
          ...user,
          is_checked: data?.members?.some((m) => m.user_id === user.user_id),
          is_admin: data?.members?.some(
            (m) => m.user_id === user.user_id && m.is_admin
          ),
          creator: data?.members
            ?.filter((m) => m.user_id === user.user_id)
            .map((m) => m.creator)[0] || null, // Extract the first value or null
          createdAt: data?.members
            ?.filter((m) => m.user_id === user.user_id)
            .map((m) => m.createdAt)[0] || null, // Extract the first value or null
        }))
          .sort((a, b) => (b.is_checked === true) - (a.is_checked === true));;

      } else {
        updatedUsers = res.data
          .filter((user) =>
            data?.members?.some((m) => m.user_id === user.user_id)
          )
          .map((user) => ({
            ...user,
            is_admin: data?.members?.some(
              (m) => m.user_id === user.user_id && m.is_admin
            ),
            creator: data?.members
              ?.filter((m) => m.user_id === user.user_id)
              .map((m) => m.creator)[0] || null, // Extract the first value or null
            createdAt: data?.members
              ?.filter((m) => m.user_id === user.user_id)
              .map((m) => m.createdAt)[0] || null, // Extract the first value or null
          }))
          .sort((a, b) => (b.is_admin === true) - (a.is_admin === true)); // Sort with is_admin: 1 first

      }

      setUsers(updatedUsers);
      const is_checked = updatedUsers.every((user) => user?.is_checked);
      setParent(is_checked);
    }
  };

  useEffect(() => {
    setValue("name", data?.name);
    setValue("short_desc", data?.short_desc);
    setPreview(getImageURL(data?.photo));
  }, []);

  return data.is_group === 1 ? (
    <form
      className="bg-white shadow-md rounded px-8 pt-6 pb-8 mb-4"
      onSubmit={handleSubmit(editGroupFormHandler)}
    >
      <div className="print-container fixed inset-0 bg-gray-800 bg-opacity-50 flex items-center justify-center z-50">
        <div className="relative bg-white rounded-lg shadow-lg w-[600px] max-h-[90vh] p-6 overflow-y-auto">
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
            <h1 className="font-bold">{data.name}</h1>
            <h6 className="text-xs">Created By : {data?.creator?.name}</h6>
            <h6 className="text-xs">
              Created At : {dateTimeFormat(data?.createdAt)}
            </h6>
            <div className="w-full max-w-md mt-5">
              <div className="mb-4">
                <label
                  className="block text-gray-700 text-sm font-bold mb-2 text-start"
                  htmlFor="name"
                >
                  Group Name <span className="text-red-600">*</span>
                </label>
                <input
                  className="shadow appearance-none border border-green-300 rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline mb-1"
                  id="name"
                  type="text"
                  placeholder="Name"
                  readOnly={!data?.is_admin}
                  {...register("name", {
                    required: "This field is required",
                    minLength: {
                      value: 3,
                      message: "This should be atleast 3 characters.",
                    },
                  })}
                />
                {errors?.name && (
                  <ValidationError message={errors?.name?.message} />
                )}
              </div>
              <div className="mb-4">
                <label
                  className="block text-gray-700 text-sm font-bold mb-2 text-start"
                  htmlFor="short_desc"
                >
                  Short Description
                </label>
                <textarea
                  readOnly={!data?.is_admin}
                  className="shadow appearance-none border border-green-300 rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline mb-1"
                  id="short_desc"
                  type="text"
                  placeholder="Enter Short Description..."
                  {...register("short_desc", { required: false })}
                ></textarea>
                {errors?.short_desc && (
                  <ValidationError message={errors?.short_desc?.message} />
                )}
              </div>
              {data?.is_admin && (
                <div className="mb-6">
                  <label
                    className="block text-gray-700 text-sm font-bold mb-2 text-start"
                    htmlFor="photo"
                  >
                    Photo
                  </label>
                  <input
                    className="shadow appearance-none border border-green-300 rounded w-full py-2 px-3 text-gray-700 mb-1 leading-tight focus:outline-none focus:shadow-outline"
                    id="photo"
                    type="file"
                    placeholder="******************"
                    onChange={(e) => handlePhotoChange(e.target.files[0])}
                  />
                </div>
              )}
              {preview ? (
                <div className="mb-6 border border-green-300">
                  <img
                    src={preview}
                    alt="Profile Photo"
                    height={150}
                    width={150}
                  />
                </div>
              ) : null}
              <hr />
              <strong>Members Info ({data?.members?.length})</strong>
              <input
                className="shadow appearance-none border border-red-300 rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline mb-1"
                id="search"
                type="search"
                placeholder="Search User..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div className="relative overflow-x-auto shadow-md sm:rounded-lg">
                <table className="w-full text-sm text-left rtl:text-right text-gray-500 dark:text-gray-400">
                  <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
                    <tr>
                      {data?.is_admin ? (
                        <th scope="col" className="p-4">
                          <div className="flex items-center">
                            <input
                              id="checkbox-all-search"
                              type="checkbox"
                              checked={parent}
                              onChange={(e) =>
                                handleParentChange(e.target.checked)
                              }
                              className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 dark:focus:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                            />
                            <label
                              htmlFor="checkbox-all-search"
                              className="sr-only"
                            >
                              checkbox
                            </label>
                          </div>
                        </th>
                      ) : null}
                      <th scope="col" className="px-6 py-3">
                        Photo
                      </th>
                      <th scope="col" className="px-6 py-3">
                        Name
                      </th>
                      <th scope="col" className="px-6 py-3">
                        {data?.is_admin ? "Is Admin" : "Status"}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {users?.map((user) => {
                      return (
                        <tr
                          className="bg-white border-b dark:bg-gray-800 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600"
                          key={user?.user_id}
                        >
                          {data?.is_admin ? (
                            <td className="w-4 p-4">
                              <div className="flex items-center">
                                <input
                                  id="checkbox-table-search-1"
                                  type="checkbox"
                                  checked={user?.is_checked}
                                  onChange={(e) =>
                                    handleChildChange(user?.user_id)
                                  }
                                  className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 dark:focus:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                                />
                                <label
                                  htmlFor="checkbox-table-search-1"
                                  className="sr-only"
                                >
                                  checkbox
                                </label>
                              </div>
                            </td>
                          ) : null}
                          <td className="px-6 py-4">
                            <img
                              src={getImageURL(user?.photo)}
                              alt={user?.name}
                              height={40}
                              width={40}
                              className="rounded-full border-2 border-red-400"
                            />
                          </td>
                          <td className="px-6 py-4">
                            <p>{user?.name}</p>
                            {user?.creator ? (
                              <h6 className="text-xs">
                                Created By : {user?.creator}
                              </h6>
                            ) : (
                              ""
                            )}
                            {user?.createdAt ? (
                              <h6 className="text-xs">
                                Created At : {dateFormat(user?.createdAt)}
                              </h6>
                            ) : (
                              ""
                            )}
                          </td>
                          <td className="px-6 py-4">
                            {data?.is_admin ? (
                              <input
                                id="checkbox-table-search-1"
                                type="checkbox"
                                checked={user?.is_admin}
                                onChange={(e) =>
                                  handleAdminChange(user?.user_id)
                                }
                                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 dark:focus:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                              />
                            ) : user?.is_admin ? (
                              <span className="bg-green-500 text-white p-1 rounded-md">
                                Admin
                              </span>
                            ) : (
                              ""
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="flex justify-end mt-6 space-x-3">
            <button
              disabled={isDisabled}
              className={`bg-red-500 hover:bg-red-700 text-white font-bold py-1 px-2 text-sm md:py-2 md:px-4 rounded focus:outline-none focus:shadow-outline ${isDisabled ? 'cursor-not-allowed opacity-50' : ''
                }`}
              type="button"
              onClick={handleLeaveGroup}
            >
              Leave From Group
            </button>
            {data?.is_admin ? (
              <>
                <button
                  disabled={isDisabled}
                  className={`bg-red-500 hover:bg-red-700 text-white font-bold py-1 px-2 text-sm md:py-2 md:px-4 rounded focus:outline-none focus:shadow-outline ${isDisabled ? 'cursor-not-allowed opacity-50' : ''
                    }`}
                  type="button"
                  onClick={handleDeleteGroup}
                >
                  Delete Group
                </button>
                <button
                  disabled={isDisabled}
                  className={`bg-green-500 hover:bg-blue-700 text-white font-bold py-1 px-2 text-sm md:py-2 md:px-4 rounded focus:outline-none focus:shadow-outline ${isDisabled ? 'cursor-not-allowed opacity-50' : ''
                    }`}
                  type="submit"
                >
                  Update Group
                </button>
              </>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="bg-black text-white font-bold py-1 px-2 text-sm md:py-2 md:px-4 rounded focus:outline-none focus:shadow-outline"
              title="Close"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </form>
  ) : (
    <div className="bg-white shadow-md rounded px-8 pt-6 pb-8 mb-4">
      <div className="print-container fixed inset-0 bg-gray-800 bg-opacity-50 flex items-center justify-center z-50">
        <div className="relative bg-white rounded-lg shadow-lg w-[400px] max-h-[90vh] p-6 overflow-y-auto">
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
            <h1 className="font-bold">{data.name}</h1>
            <div className="w-full max-w-md mt-5">
              <div className="mb-4">
                <div>{data.phone}</div>
              </div>
              <div className="mb-4">
                <div>{data.address}</div>
              </div>
              <div className="flex justify-end mt-6 space-x-3 flex">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-300"
                  title="Close"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GroupEditOrViewModal;
