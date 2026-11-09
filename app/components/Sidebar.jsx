import { useRouter } from "next/navigation";
import { useContext, useEffect, useRef, useState } from "react";
import { CgProfile } from "react-icons/cg";
import { IoIosAddCircleOutline, IoMdArrowDropdown } from "react-icons/io";
import { IoPowerOutline } from "react-icons/io5";
import { MdAdd } from "react-icons/md";
import { AuthContext } from "../contexts/AuthContext";
import { clearAuthProfile, getImageURL, socket_connection } from "../helpers/helper";
import GroupCreateModal from "./GroupCreateModal";
import ProfileModal from "./ProfileModal";
import Users from "./Users";
let socket = socket_connection();

const Sidebar = ({ search, setSearch, activeUsers, className = "" }) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const sectionRef = useRef(null);
  const router = useRouter();
  const { user, setUser } = useContext(AuthContext);
  const [isProfileModalOpen, setProfileModalOpen] = useState(false);
  const [isAddGroupModalOpen, setAddGroupModalOpen] = useState(false);

  const toggleDropdown = () => {
    setIsDropdownOpen(!isDropdownOpen);
  };

  const logout = async () => {
    const socket = socket_connection();
    socket.emit("user-logout", user?._id);
    await fetch("/api/auth/logout", { method: "POST" });
    clearAuthProfile();
    setUser("");
    router.push("/auth");
  };

  const handleAddGroupModal = () => {
    setIsDropdownOpen(false);
    setAddGroupModalOpen(true);
  };

  const handleProfileModal = () => {
    setIsDropdownOpen(false);
    setProfileModalOpen(true);
  };

  const handleClickOutside = (event) => {
    if (sectionRef.current && !sectionRef.current.contains(event.target)) {
      setIsDropdownOpen(false);
    }
  };

  useEffect(() => {
    // setUser(auth());
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      // Cleanup event listener on unmount
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);
  return (
    <aside className={`chat-sidebar flex h-full flex-col ${className}`}>
      <header className="flex items-center justify-between border-b border-[#263248] px-4 py-4">
        <div className="flex min-w-0 cursor-pointer items-center gap-3">
          <img
            src={getImageURL(user?.photo)}
            className="h-10 w-10 rounded-full border border-indigo-400 object-cover"
            title={user?.name}
            onClick={(e) => setIsDropdownOpen(true)}
          />
          <h1 className="truncate text-sm font-semibold text-white">
            {user?.name}
          </h1>
          <div className="ml-auto">
            <IoMdArrowDropdown
              title="More"
              className="w-5 text-[#91a0b7]"
              role="button"
              aria-label="Account menu"
              tabIndex={0}
              onMouseOver={(e) => setIsDropdownOpen(true)}
              onClick={toggleDropdown}
            />
          </div>
        </div>
        {isDropdownOpen ? (
          <div
            ref={sectionRef}
            className="dropdown-list right-4 top-16"
          >
            <ul
              className="py-1 text-sm text-gray-200"
              aria-labelledby="dropdownDefaultButton"
            >
              <li>
                <button
                  onClick={handleAddGroupModal}
                  className="flex w-full items-center px-4 py-3 text-left hover:bg-[#263248]"
                >
                  <IoIosAddCircleOutline className="mr-2 text-indigo-300" />
                  Add Group
                </button>
              </li>
              <li>
                <button
                  onClick={handleProfileModal}
                  className="flex w-full items-center px-4 py-3 text-left hover:bg-[#263248]"
                >
                  <CgProfile className="mr-2 text-indigo-300" />
                  Profile
                </button>
              </li>
              <li>
                <button
                  onClick={() => logout()}
                  className="flex w-full items-center px-4 py-3 text-left text-rose-300 hover:bg-[#263248]"
                >
                  <IoPowerOutline className="mr-2" />
                  Sign out
                </button>
              </li>
            </ul>
          </div>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="flex justify-between">
          <input
            type="text"
            className="form-control mb-5"
            placeholder="Search conversations"
            aria-label="Search conversations"
            onChange={(e) => setSearch(e.target.value)}
            value={search}
          />
          <button className="w-50 hidden" title="Create group">
            <MdAdd></MdAdd>
          </button>
        </div>
        <Users activeUsers={activeUsers} />
      </div>
      <ProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setProfileModalOpen(false)}
      />
      <GroupCreateModal
        isOpen={isAddGroupModalOpen}
        onClose={() => setAddGroupModalOpen(false)}
      />
    </aside>
  );
};

export default Sidebar;
