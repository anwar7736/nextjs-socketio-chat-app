import { useContext, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import Swal from "sweetalert2";
import { AuthContext } from "../contexts/AuthContext";
import { MessageContext } from "../contexts/MessageContext";
import { UserContext } from "../contexts/UserContext";
import { UserListContext } from "../contexts/UserListContext";
import { dateFormat, dateTimeFormat, getImageURL, socket_connection } from "../helpers/helper";
import ValidationError from "./ValidationError";

const socket = socket_connection();

const GroupEditOrViewModal = ({ isOpen, onClose, data }) => {
  const { register, handleSubmit, setValue, setError, clearErrors, formState: { errors } } = useForm();
  const [preview, setPreview] = useState("");
  const [photo, setPhoto] = useState(null);
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [parent, setParent] = useState(false);
  const [isDisabled, setIsDisabled] = useState(false);
  const [memberError, setMemberError] = useState("");
  const [adminError, setAdminError] = useState("");
  const [serverError, setServerError] = useState("");
  const [nickname, setNickname] = useState("");
  const [savingNickname, setSavingNickname] = useState(false);
  const { user } = useContext(AuthContext);
  const { user: selectedUser, setUser: setSelectedUser } = useContext(UserContext);
  const { users: userList, setUsers: setUserList } = useContext(UserListContext);
  const { setMessages, setCallLogs } = useContext(MessageContext);

  // The modal stays mounted while its data is fetched by the parent. Hydrate the
  // form whenever it opens or receives fresh group data, rather than only once
  // when this component first mounts.
  useEffect(() => {
    if (!isOpen || !data) return;
    setValue("name", data.name || "");
    setValue("short_desc", data.short_desc || "");
    setPreview(data.photo ? getImageURL(data.photo) : "");
    setPhoto(null);
    clearErrors();
    setMemberError("");
    setAdminError("");
    setServerError("");
  }, [isOpen, data?._id, data?.name, data?.short_desc, data?.photo, setValue, clearErrors]);

  useEffect(() => {
    if (isOpen) setNickname(selectedUser?.nickname || "");
  }, [isOpen, selectedUser?._id, selectedUser?.nickname]);

  useEffect(() => {
    if (!isOpen || data?.is_group !== 1) return;
    let cancelled = false;
    const loadUsers = async () => {
      try {
        const response = await fetch(`/api/users/list?search=${encodeURIComponent(search)}`);
        const result = await response.json();
        if (!response.ok || !result.success || cancelled) return;
        const members = data?.members || [];
        const memberFor = (id) => members.find((member) => String(member.user_id) === String(id));
        const nextUsers = (result.data || [])
          .map((item) => {
            const member = memberFor(item.user_id);
            return {
              ...item,
              is_checked: Boolean(member),
              is_admin: Boolean(member?.is_admin),
              creator: member?.creator || null,
              createdAt: member?.createdAt || null,
            };
          })
          .filter((item) => data?.is_admin || item.is_checked)
          .sort((a, b) => Number(b.is_checked) - Number(a.is_checked));
        setUsers(nextUsers);
        setParent(nextUsers.length > 0 && nextUsers.every((item) => item.is_checked));
      } catch (error) {
        if (!cancelled) toast.error(error.message || "Unable to load group members.");
      }
    };
    loadUsers();
    return () => { cancelled = true; };
  }, [isOpen, search, data?._id, data?.is_admin, data?.members]);

  const saveNickname = async () => {
    if (savingNickname || selectedUser?.is_group === 1) return;
    setSavingNickname(true);
    try {
      const response = await fetch(`/api/user/profile/${user?._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact_id: selectedUser?._id, nickname }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.message || "Unable to save this nickname.");
      setSelectedUser({ ...selectedUser, nickname: result.nickname });
      setUserList((current) => current.map((item) => item?._id === selectedUser?._id ? { ...item, nickname: result.nickname } : item));
      toast.success(result.nickname ? "Nickname updated." : "Nickname removed.");
      onClose();
    } catch (error) {
      toast.error(error.message || "Unable to save this nickname.");
    } finally {
      setSavingNickname(false);
    }
  };

  const editGroupFormHandler = async (input) => {
    setIsDisabled(true);
    const selectedMembers = users.filter((item) => item.is_checked);
    if (!selectedMembers.length) {
      setMemberError("Choose at least one group member.");
      setIsDisabled(false);
      return;
    }
    if (!selectedMembers.some((item) => item.is_admin)) {
      setAdminError("Choose at least one group admin.");
      setIsDisabled(false);
      return;
    }

    setMemberError("");
    setAdminError("");
    setServerError("");
    const formData = new FormData();
    formData.append("group_id", data._id);
    formData.append("name", input.name);
    formData.append("short_desc", input.short_desc || "");
    if (photo) formData.append("photo", photo);
    formData.append("group_members", JSON.stringify(selectedMembers.map(({ user_id, is_admin }) => ({ user_id, is_admin }))));

    try {
      const response = await fetch("/api/group", { method: "PUT", body: formData });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) {
        const message = result.message || "Unable to update the group.";
        const lower = message.toLowerCase();
        if (lower.includes("name")) setError("name", { type: "server", message });
        else if (lower.includes("photo") || lower.includes("file") || lower.includes("image")) setError("photo", { type: "server", message });
        else if (lower.includes("admin")) setAdminError(message);
        else if (lower.includes("member")) setMemberError(message);
        else setServerError(message);
        return;
      }
      setSelectedUser((current) => current?._id === data._id ? { ...current, name: result.data.name, photo: result.data.photo, total_members: result.data.total_members, member_ids: result.data.member_ids } : current);
      setUserList((current) => current.map((item) => item?._id === data._id ? { ...item, name: result.data.name, photo: result.data.photo, total_members: result.data.total_members, member_ids: result.data.member_ids } : item));
      socket.emit("update-group", JSON.stringify(result.data));
      window.dispatchEvent(new Event("chat:refresh-conversations"));
      toast.success(result.message || "Group updated successfully.");
      onClose();
    } catch (error) {
      setServerError(error.message || "Unable to update the group.");
    } finally {
      setIsDisabled(false);
    }
  };

  const toggleMember = (userId) => {
    const next = users.map((item) => String(item.user_id) === String(userId) ? { ...item, is_checked: !item.is_checked } : item);
    setUsers(next);
    setParent(next.length > 0 && next.every((item) => item.is_checked));
    if (next.some((item) => item.is_checked)) setMemberError("");
  };

  const toggleAdmin = (userId) => {
    const next = users.map((item) => String(item.user_id) === String(userId) ? { ...item, is_admin: !item.is_admin } : item);
    setUsers(next);
    if (next.some((item) => item.is_checked && item.is_admin)) setAdminError("");
  };

  const toggleAllMembers = (checked) => {
    setUsers((current) => current.map((item) => ({ ...item, is_checked: checked })));
    setParent(checked);
    if (checked) setMemberError("");
  };

  const handlePhotoChange = (file) => {
    if (!file) {
      setPreview(data?.photo ? getImageURL(data.photo) : "");
      setPhoto(null);
      return;
    }
    setPhoto(file);
    setPreview(URL.createObjectURL(file));
  };

  const leaveGroup = async () => {
    if (data?.is_admin && !users.some((item) => item.is_checked && item.is_admin && String(item.user_id) !== String(user?._id))) {
      setAdminError("Choose another admin before leaving this group.");
      return;
    }
    const confirmation = await Swal.fire({ title: "Are you sure?", text: "You won't be able to leave this group!", icon: "warning", showCancelButton: true, confirmButtonText: "Yes", cancelButtonText: "No" });
    if (!confirmation.isConfirmed) return;
    setIsDisabled(true);
    try {
      const response = await fetch("/api/group", { method: "PATCH", body: JSON.stringify({ group_id: data._id }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || "Unable to leave the group.");
      setUserList((current) => current.filter((item) => item._id !== data._id));
      setSelectedUser("");
      setMessages([]);
      setCallLogs([]);
      socket.emit("leave-group", JSON.stringify({ _id: data._id, user_id: user?._id, message: `${user?.name} left from \"${data.name}\"`, groupMembers: (result.groupMembers || []).map((member) => String(member.user_id)) }));
      onClose();
    } catch (error) {
      toast.error(error.message || "Unable to leave the group.");
    } finally {
      setIsDisabled(false);
    }
  };

  const deleteGroup = async () => {
    const confirmation = await Swal.fire({ title: "Are you sure?", text: "You won't be able to delete this group!", icon: "warning", showCancelButton: true, confirmButtonText: "Yes", cancelButtonText: "No" });
    if (!confirmation.isConfirmed) return;
    setIsDisabled(true);
    try {
      const response = await fetch(`/api/group?id=${data?._id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || "Unable to delete the group.");
      setUserList((current) => current.filter((item) => item._id !== data._id));
      setSelectedUser("");
      setMessages([]);
      setCallLogs([]);
      socket.emit("delete-group", JSON.stringify({ _id: data._id, deleted_by: user?._id, message: `\"${data.name}\" deleted by ${user?.name}`, groupMembers: (result.groupMembers || []).map((member) => String(member.user_id)) }));
      onClose();
    } catch (error) {
      toast.error(error.message || "Unable to delete the group.");
    } finally {
      setIsDisabled(false);
    }
  };

  if (!isOpen || !data) return null;

  if (Number(data.is_group) !== 1) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-800/50">
        <section className="relative max-h-[90vh] w-[400px] overflow-y-auto rounded-lg bg-white p-6 shadow-lg">
          <button type="button" className="absolute right-4 top-4 text-gray-500" onClick={onClose} aria-label="Close">×</button>
          {data.photo ? <img src={getImageURL(data.photo)} alt={data.name} className="mx-auto mb-3 h-20 w-20 rounded-full object-cover" /> : null}
          <h2 className="text-center text-lg font-bold">{selectedUser?.nickname || data.name}</h2>
          <div className="mt-5">
            <label htmlFor="contact-nickname" className="mb-2 block text-sm font-semibold">Your nickname for them</label>
            <div className="flex gap-2">
              <input id="contact-nickname" className="min-w-0 flex-1 rounded border px-3 py-2" value={nickname} maxLength={40} onChange={(event) => setNickname(event.target.value)} />
              <button type="button" onClick={saveNickname} disabled={savingNickname} className="rounded bg-indigo-600 px-3 py-2 text-white">{savingNickname ? "Saving…" : "Save"}</button>
            </div>
            <p className="mt-3">{data.phone}</p><p>{data.address}</p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-800/50">
      <form className="relative max-h-[90vh] w-[600px] overflow-y-auto rounded-lg bg-white p-6 shadow-lg" onSubmit={handleSubmit(editGroupFormHandler)} noValidate>
        <button type="button" className="absolute right-4 top-4 text-gray-500" onClick={onClose} aria-label="Close">×</button>
        <div className="text-center">
          <h2 className="font-bold">{data.name}</h2>
          <p className="text-xs">Created by: {data?.creator?.name || ""}</p>
          <p className="text-xs">Created at: {dateTimeFormat(data?.createdAt)}</p>
        </div>
        <div className="mx-auto mt-5 max-w-md">
          {serverError && <ValidationError message={serverError} />}
          <label className="mb-2 block text-sm font-bold" htmlFor="name">Group Name *</label>
          <input id="name" className="mb-1 w-full rounded border border-green-300 px-3 py-2" readOnly={!data.is_admin} {...register("name", { required: "This field is required", minLength: { value: 3, message: "This should be at least 3 characters." } })} />
          {errors.name && <ValidationError message={errors.name.message} />}
          <label className="mb-2 mt-4 block text-sm font-bold" htmlFor="short_desc">Short Description</label>
          <textarea id="short_desc" className="mb-1 w-full rounded border border-green-300 px-3 py-2" readOnly={!data.is_admin} {...register("short_desc")} />
          {errors.short_desc && <ValidationError message={errors.short_desc.message} />}
          {data.is_admin && <>
            <label className="mb-2 mt-4 block text-sm font-bold" htmlFor="photo">Group Photo</label>
            <input id="photo" type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="mb-2 w-full rounded border px-3 py-2" onChange={(event) => { clearErrors("photo"); handlePhotoChange(event.target.files?.[0]); }} />
            {errors.photo && <ValidationError message={errors.photo.message} />}
          </>}
          {preview && <img src={preview} alt="Group photo preview" className="mb-4 h-[150px] w-[150px] border border-green-300 object-cover" />}
          <hr />
          <strong>Members Info ({data?.members?.length || 0})</strong>
          {data.is_admin && <label className="my-2 flex items-center gap-2"><input type="checkbox" checked={parent} onChange={(event) => toggleAllMembers(event.target.checked)} /> Select all</label>}
          <input className="my-2 w-full rounded border px-3 py-2" type="search" placeholder="Search User…" value={search} onChange={(event) => setSearch(event.target.value)} />
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr><th>Member</th><th>{data.is_admin ? "Admin" : "Role"}</th></tr></thead>
              <tbody>{users.map((item) => <tr key={item.user_id} className="border-b">
                <td className="py-2">
                  {data.is_admin && <input type="checkbox" checked={Boolean(item.is_checked)} onChange={() => toggleMember(item.user_id)} className="mr-2" />}
                  <img src={getImageURL(item.photo)} alt={item.name} width={36} height={36} className="mr-2 inline-block rounded-full" />
                  {item.name}
                  {item.creator && <div className="text-xs">Added by: {item.creator}</div>}
                  {item.createdAt && <div className="text-xs">Added: {dateFormat(item.createdAt)}</div>}
                </td>
                <td>{data.is_admin ? <input type="checkbox" checked={Boolean(item.is_admin)} disabled={!item.is_checked} onChange={() => toggleAdmin(item.user_id)} /> : item.is_admin ? "Admin" : ""}</td>
              </tr>)}</tbody>
            </table>
          </div>
          <ValidationError message={memberError} /><ValidationError message={adminError} />
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" disabled={isDisabled} onClick={leaveGroup} className="rounded bg-red-500 px-3 py-2 text-white disabled:opacity-50">Leave</button>
          {data.is_admin && <>
            <button type="button" disabled={isDisabled} onClick={deleteGroup} className="rounded bg-red-500 px-3 py-2 text-white disabled:opacity-50">Delete</button>
            <button type="submit" disabled={isDisabled} className="rounded bg-green-600 px-3 py-2 text-white disabled:opacity-50">Update</button>
          </>}
          <button type="button" onClick={onClose} className="rounded bg-black px-3 py-2 text-white">Close</button>
        </div>
      </form>
    </div>
  );
};

export default GroupEditOrViewModal;
