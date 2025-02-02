import { deleteCookie } from "cookies-next";
import { useRouter } from "next/navigation";
import { useContext, useEffect, useRef, useState } from "react";
import { CgProfile } from "react-icons/cg";
import { IoIosAddCircleOutline, IoMdArrowDropdown } from "react-icons/io";
import { IoPowerOutline } from "react-icons/io5";
import { MdAdd } from "react-icons/md";
import { AuthContext } from "../contexts/AuthContext";
import { getImageURL, socket_connection } from "../helpers/helper";
import GroupCreateModal from "./GroupCreateModal";
import ProfileModal from "./ProfileModal";
import Users from "./Users";
let socket = socket_connection();

const Sidebar = ({ search, setSearch, activeUsers }) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const sectionRef = useRef(null);
  const router = useRouter();
  const { user, setUser } = useContext(AuthContext);
  const [isProfileModalOpen, setProfileModalOpen] = useState(false);
  const [isAddGroupModalOpen, setAddGroupModalOpen] = useState(false);

  const toggleDropdown = () => {
    setIsDropdownOpen(!isDropdownOpen);
  };

  const logout = () => {
    // socket.emit("user-logout", user?._id);
    // socket.off();
    // socket.removeAllListeners();
    // socket.disconnect();
    deleteCookie("auth");
    // router.push("/auth");
    window.location.href = "/auth";
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
    <div className="sm:w-1/2 md:w-1/3 lg:w-1/4 xl:w-1/6 bg-white border-r border-gray-300">
      <header className="p-1 border-b border-gray-300 flex justify-between items-center bg-purple-600 text-white">
        <div className="cursor-pointer mt-3 flex pb-2">
          <img
            src={getImageURL(user?.photo)}
            className="border-2 border-red-400 rounded-full w-10 h-10"
            title={user?.name}
            onClick={(e) => setIsDropdownOpen(true)}
          />
          <h1 className="text-xs xs:text-sm sm:text-lg md:text-xl xl:text-2xl font-semibold px-1 mt-1">
            {user?.name}
          </h1>
          <div>
            <IoMdArrowDropdown
              title="More"
              className="mt-3 w-4 mr-4"
              onMouseOver={(e) => setIsDropdownOpen(true)}
            />
          </div>
        </div>
        {isDropdownOpen ? (
          <div
            ref={sectionRef}
            className="z-10  bg-white divide-y divide-gray-100 rounded-lg shadow dark:bg-gray-700 absolute ml-24 mt-28 w-40"
          >
            <ul
              className="py-1 px-1 text-sm dark:text-gray-200 text-purple-700 font-bold"
              aria-labelledby="dropdownDefaultButton"
            >
              <li>
                <button
                  onClick={handleAddGroupModal}
                  className="block px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 dark:hover:text-white flex"
                >
                  <IoIosAddCircleOutline className="mr-1 mt-1 bg-purple-300 rounded-lg" />
                  Add Group
                </button>
              </li>
              <li>
                <button
                  onClick={handleProfileModal}
                  className="block px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 dark:hover:text-white flex"
                >
                  {" "}
                  <CgProfile className="mr-1 mt-1 bg-purple-300 rounded-lg" />
                  Profile
                </button>
              </li>
              <li>
                <button
                  onClick={() => logout()}
                  className="block px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 dark:hover:text-white flex"
                >
                  <IoPowerOutline className="mr-1 mt-1 bg-purple-300 rounded-lg" />
                  Sign out
                </button>
              </li>
            </ul>
          </div>
        ) : null}
      </header>

      <div className="overflow-y-auto h-screen p-3 mb-9 pb-20">
        <div className="flex justify-between">
          <input
            type="text"
            className="w-full p-1 rounded-md border border-green-400 focus:outline-none focus:border-blue-500 mb-3"
            placeholder="Find partner..."
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
    </div>
  );
};

export default Sidebar;
