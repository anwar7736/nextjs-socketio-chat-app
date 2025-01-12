"use client";
import { useContext, useEffect, useState } from 'react';
import Messages from './components/Messages';
import Sidebar from './components/Sidebar'
import { FaVideo } from "react-icons/fa";
import { MdAddIcCall } from "react-icons/md";
import { UserContext } from './contexts/UserContext';
import { MessageContext } from './contexts/MessageContext';
import { auth, getImageURL, loadMessages, socket_connection } from './helpers/helper';
import { UserListContext } from './contexts/UserListContext';
import GroupEditOrViewModal from './components/GroupEditOrViewModal';
import { toast } from 'react-toastify';
import { AuthContext } from './contexts/AuthContext';
import Picker from "emoji-picker-react";
let socket = socket_connection();
const Home = () => {
  const { users, setUsers } = useContext(UserListContext);
  const [activeUsers, setActiveUsers] = useState([]);
  const { user, setUser } = useContext(UserContext)
  // const { user: authUser, setUser: setAuthUser } = useContext(AuthContext)
  const { messages, setMessages } = useContext(MessageContext);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [isModalOpen, setModalOpen] = useState(false);
  const [data, setData] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const authUser = auth();
  const onEmojiClick = (emojiObject) => {
    setMessage((msg) => msg + emojiObject.emoji);
    setShowPicker(false);
  };


  const getUserList = async () => {
    let res = await fetch(`/api/users?auth_id=${authUser._id}&search=${search}`);
    res = await res.json();
    if (res.success) {
      setUsers(res.data);
    }
  }

  useEffect(() => {
    getUserList();
  }, [search]);

  useEffect(() => {
    socket.emit('register-user', authUser._id);
  }, []);

  const sendMessage = async (e) => {
    e.preventDefault();
    setMessage('');
    const data = {
      "message": message,
      "sender_id": authUser?._id,
      "receiver_id": user?._id,
      "is_group": user?.is_group
    };
    let res = await fetch("api/messages", {
      method: "POST",
      body: JSON.stringify(data)
    });
    res = await res.json();
    if (res.success) {
      socket.emit('private-message', JSON.stringify(res.data));
    }
  }

  //load read time messages
  const loadRealTimeMessages = () => {
    socket.off('private-message');
    socket.on('private-message', async (data) => {
      console.log(data);
      if ((data?.is_group == 1 && user?._id == data?.receiver_id) || (data?.sender_id == authUser?._id && data?.receiver_id == user?._id) ||
        (data?.sender_id == user?._id && data?.receiver_id == authUser?._id)) {
        let res = await loadMessages(user);
        console.log(res);

        setMessages(res);
      }
      else if (data?.receiver_id == authUser?._id || data?.is_group == 1) {
        let userList = [...users];
        let index = userList.findIndex(user => ((user?._id == data.sender_id || user?._id == data.receiver_id) && user?.is_group == data?.is_group));
        if (index >= 0) {
          userList[index].pending++;
          setUsers(userList);
        }
      }
    });
  };

  //online users
  const loadActiveUsers = () => {
    socket.off('active-users');
    socket.on('active-users', (data) => {
      setActiveUsers(data);

    });

    //new user registered
    socket.off('new-user');
    socket.on('new-user', (data) => {
      getUserList();
      if (data?._id !== authUser?._id) {
        toast.success(data?.message);
      }
    });

    socket.off('user-updated');
    socket.on('user-updated', (data) => {
      //update users
      let userList = [...users];
      let index = userList.findIndex(user => user?._id == data?._id);
      if (index >= 0) {
        userList[index].name = data?.name;
        userList[index].photo = data?.photo;
        setUsers(userList);
      }

      //update messages
      let filterMessages = [...(messages || [])];
      let sender = "";
      filterMessages = filterMessages.map((msg) => {
        sender = msg?.sender?.[0];
        if (sender && sender?._id === data?._id) {
          sender.name = data?.name;
          sender.photo = data?.photo;
        }

        return msg;
      });

      setMessages(filterMessages);
      if (data?._id !== authUser?._id) {
        toast.success(data?.message);
      }

    });

    socket.off('message-deleted');
    socket.on('message-deleted', (data) => {
      let filterMessages = [...messages];
      filterMessages = filterMessages.filter(m => m?._id !== data?._id);
      setMessages(filterMessages);
    });

    socket.off('add-group');
    socket.on('add-group', (data) => {
      let newUser = {
        _id: data?._id,
        name: data?.name,
        photo: data?.photo,
        pending: 0,
        is_group: 1,
        total_members: data?.group_members?.length
      };

      let newUsers = [...users, newUser];

      setUsers(newUsers);
      if (data?.created_by !== authUser?._id) {
        toast.success(data?.message);
      }
    });

    socket.off('update-group');
    socket.on('update-group', (data) => {
      setModalOpen(false);
      console.log(data)
      if (data?.res?.status === 0) {
        let newUsers = users.filter(user => user._id !== data?._id);
        setUsers(newUsers);
        if (user._id === data?._id) {
          setUser('');
          setMessages([]);
        }
      }

      if (data?.res?.status === 1) {
        let newUser = {
          _id: data?._id,
          name: data?.name,
          photo: data?.photo,
          pending: 0,
          is_group: 1,
          total_members: data?.total_members
        };

        let newUsers = [...users, newUser];

        setUsers(newUsers);
      }
      if (user._id !== data?._id) {
        toast.success(data?.res?.message);
      }

    });

    socket.off('delete-group');
    socket.on('delete-group', (data) => {
      setModalOpen(false);
      if (user._id === data?._id) {
        setUser('');
        setMessages([]);
      }
      let newUsers = users.filter(user => user._id !== data?._id);
      setUsers(newUsers);
      if (data.deleted_by !== authUser._id) {
        toast.success(data?.message);
      }
    });

    socket.off('leave-group');
    socket.on('leave-group', (res) => {
      if (user._id === res?._id) {
        setUser({ ...user, total_members: user.total_members - 1 });
        if (isModalOpen) {
          let newMembers = data?.members?.filter(m => m.user_id !== res?.user_id);
          setData({ ...data, members: newMembers });
        }
      }

      if (res?.user_id !== authUser?._id) {
        toast.success(res?.message);
      }
    });

  };

  useEffect(() => {
    loadRealTimeMessages();
    loadActiveUsers();
  }, [user, authUser]);

  const handleEditOrViewModal = async () => {
    if (user.is_group === 1) {
      let res = await fetch(`/api/group?id=${user?._id}`);
      res = await res.json();
      if (res.success) {
        res.data.is_group = 1;
        res.data.is_admin = res.data.members.some(
          (member) => member.is_admin === 1 && member.user_id === authUser._id
        );
        console.log(res.data);
        setData(res.data);
      }
    }
    else {
      let res = await fetch(`/api/user/profile/${user?._id}`);
      res = await res.json();
      if (res.success) {
        res.data.is_group = 0;
        setData(res.data);
      }
    }

    setModalOpen(true);
  }

  return (
    <div className="px-7 h-screen overflow-hidden flex items-center justify-center bg-[#edf2f7]">
      <div className="flex h-screen overflow-hidden w-full ">
        <Sidebar setSearch={setSearch} search={search} activeUsers={activeUsers} />
        <div className="w-3/4">
          {
            user && (
              <header className="bg-white p-4 text-gray-700 flex justify-between">
                <div className="text-xl font-semibold cursor-pointer flex" onClick={handleEditOrViewModal}>

                  <img src={getImageURL(user?.photo)} height={40} width={40} className="border-2 border-red-400 rounded-full w-10 h-10" title={user?.name} />
                  <span className="mt-2 text-sm xs:text-sm sm:text-md md:text-lg lg:text-lg xl:text-lg font-semibold px-1">{user?.name} {user?.total_members > 0 ? `(${user?.total_members})` : null}</span>
                  {
                    activeUsers.includes(user?._id) && (<sup className="p-1 bg-green-500 rounded" style={{ height: "0px", marginTop: "10px" }}></sup>)
                  }
                </div>
                <div className="flex justify-end px-2 hidden">
                  <div className="cursor-pointer">
                    <MdAddIcCall title="Voice Call" />
                  </div>
                  <div className="px-2 cursor-pointer">
                    <FaVideo title="Video Call" />
                  </div>

                </div>
              </header>
            )
          }
          {
            messages?.length > 0 && (<Messages />)
          }
          {
            user &&
            <div>
              <form method="POST" onSubmit={sendMessage}>
                <footer className="bg-white border-t border-gray-300 p-4 absolute bottom-0 w-4/6">
                  <div className="flex items-center gap-x-2">
                    <div className="relative w-full">
                      <div className="relative w-full">
                        {/* Input and Send Button Wrapper */}
                        <div className="flex items-center">
                          <div className="relative flex-grow">
                            <input
                              type="text"
                              placeholder="Type a message..."
                              className="w-full p-2 pr-10 rounded-md border border-gray-400 focus:outline-none focus:border-blue-500"
                              onChange={(e) => setMessage(e.target.value)}
                              value={message}
                            />
                            {/* Emoji Picker Icon */}
                            <img
                              className="absolute right-3 top-1/2 transform -translate-y-1/2 cursor-pointer"
                              title="Choose emoji"
                              src="https://icons.getbootstrap.com/assets/icons/emoji-smile.svg"
                              onClick={() => setShowPicker((val) => !val)}
                              alt="Emoji Picker"
                            />
                          </div>
                          {/* Send Button */}
                          <button
                            type="submit"
                            className={`ml-3 ${message.trim()?.length > 0 ? 'bg-indigo-500' : 'bg-indigo-200 cursor-not-allowed'
                              } text-white px-4 py-2 rounded-md`}
                            disabled={message.trim().length === 0}
                            title={message.trim().length > 0 ? 'Send' : ''}
                          >
                            Send
                          </button>
                        </div>

                        {/* Emoji Picker */}
                        {showPicker && (
                          <div className="left-0 w-full mt-2 z-10">
                            <Picker
                              pickerStyle={{ width: "100%" }}
                              onEmojiClick={onEmojiClick}
                            />
                          </div>
                        )}
                      </div>

                    </div>

                  </div>
                </footer>
              </form>
            </div>
          }



        </div>


      </div>
      <GroupEditOrViewModal
        isOpen={isModalOpen}
        onClose={() => setModalOpen(false)}
        data={data}
      />
    </div>
  )
}

export default Home