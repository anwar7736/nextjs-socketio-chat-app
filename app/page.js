"use client";
import { useContext, useEffect, useState } from 'react';
import Messages from './components/Messages';
import Sidebar from './components/Sidebar'
import { FaVideo } from "react-icons/fa";
import { MdAddIcCall } from "react-icons/md";
import { UserContext } from './contexts/UserContext';
import { MessageContext } from './contexts/MessageContext';
import { auth, getImageURL, socket_connection } from './helpers/helper';
import { UserListContext } from './contexts/UserListContext';
let socket = socket_connection();
const Home = () => {
  const { users, setUsers } = useContext(UserListContext);
  const [activeUsers, setActiveUsers] = useState([]);
  const { user, setUser } = useContext(UserContext)
  const { messages, setMessages } = useContext(MessageContext);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const authUser = auth();
  const getUserList = async () => {
    let res = await fetch(`/api/users?auth_id=${auth()?._id}&search=${search}`);
    res = await res.json();
    if (res.success) {
      console.log(res.data);
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
    const data = { "message": message, "sender_id": authUser._id, "receiver_id": user._id };
    setMessage('');
    let res = await fetch("api/messages", {
      method: "POST",
      body: JSON.stringify(data)
    });
    res = await res.json();
    if (res.success) {
      socket.emit('private-message', JSON.stringify({
        "_id": res?.data?._id,
        "message": data?.message,
        "createdAt": res?.data?.createdAt,
        "sender": [
          {
            "_id": authUser._id,
            "name": authUser.name,
            "photo": authUser.photo
          }
        ],
        "receiver": [
          {
            "_id": user._id,
            "name": user.name,
            "photo": user.photo
          }
        ]
      }));
    }
  }

  //load read time messages
  const loadRealTimeMessages = () => {
    socket.off('private-message');
    socket.on('private-message', async (data) => {
      if (
        (data.sender[0]._id === authUser._id && data.receiver[0]._id === user._id) ||
        (data.sender[0]._id === user._id && data.receiver[0]._id === authUser._id)
      ) {
        setMessages((prev) => [...prev, data]);
        if (data.receiver[0]._id === authUser._id) {
          let res = await fetch("api/messages", {
            method: "PUT",
            body: JSON.stringify({ sender_id: user._id, receiver_id: authUser._id })
          });
          res = await res.json();
        }

      } else if (data.receiver[0]._id === authUser._id) {
        let userList = [...users];
        let index = userList.findIndex(user => user?._id == data.sender[0]._id);
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
      console.log(filterMessages);
      
      
    });

    socket.off('message-deleted');
    socket.on('message-deleted', (data) => {
      let filterMessages = [...messages];
      filterMessages = filterMessages.filter(m => m?._id !== data?._id);
      setMessages(filterMessages);
    });

  };


  useEffect(() => {
    loadRealTimeMessages();
    loadActiveUsers();
  }, [user, authUser]);

  return (
    <div className="px-7 h-screen overflow-hidden flex items-center justify-center bg-[#edf2f7]">
      <div className="flex h-screen overflow-hidden w-full ">
        <Sidebar setSearch={setSearch} search={search} activeUsers={activeUsers} />
        <div className="w-3/4">
          {
            user && (
              <header className="bg-white p-4 text-gray-700 flex justify-between">
                <div className="text-xl font-semibold cursor-pointer flex">
                 
                  <img src={getImageURL(user?.photo)} height={40} width={40} className="border-2 border-red-400 rounded-full" title={user?.name}/>
                  <span className="ml-2 mt-2">{user?.name}</span>
                  {
                    activeUsers.includes(user?._id) && (<sup className="p-1 bg-green-500 rounded" style={{height:"0px", marginTop: "10px"}}></sup>)
                  }
                </div>
                <div className="flex justify-end px-2">
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
                    <input type="text" placeholder="Type a message..." className="w-full p-2 rounded-md border border-gray-400 focus:outline-none focus:border-blue-500" onChange={(e) => setMessage(e.target.value)} value={message} />
                    <button type="submit" className={`${message.trim()?.length > 0 ? 'bg-indigo-500' : 'bg-indigo-200 cursor-not-allowed'} text-white px-4 py-2 rounded-md mr-6`} disabled={message.trim().length === 0} title={message.trim().length > 0 ? 'Send' : ''}>Send</button>
                  </div>
                </footer>
              </form>
            </div>
          }



        </div>


      </div>
    </div>
  )
}

export default Home