import { useContext, useEffect, useRef } from "react";
import { auth, dateTimeFormat, getImageURL, socket_connection } from "../helpers/helper"
import { AuthContext } from "../contexts/AuthContext";
import Swal from "sweetalert2";
import { toast } from "react-toastify";
import { MessageContext } from "../contexts/MessageContext";
const socket = socket_connection();
const Messages = () => {
    const elementRef = useRef(null);
    const {user, setUser} = useContext(AuthContext);
      const { messages, setMessages } = useContext(MessageContext);
    useEffect(() => {
        if (elementRef.current) {
            elementRef.current.scrollTo({
                top: elementRef.current.scrollHeight,
                behavior: 'smooth',
            });
        }

    }, [messages]);
    const handleRemoveMsg = (msg) =>{
        Swal.fire({
            title: "Are you sure?",
            text: "You won't be able to remove this!",
            icon: "warning",
            showCancelButton: true,
            confirmButtonColor: "#3085d6",
            cancelButtonColor: "#d33",
            confirmButtonText: "Yes",
            cancelButtonText: "No"
          }).then(async (result) => {
            if (result.isConfirmed) {
              let method = (msg?.sender?._id === user?._id) ? "DELETE" : "PATCH";
              let res = await fetch(`/api/messages/${msg?._id}`, {method});
              res = await res.json();
              if (res.success) {
                toast.success(res.message);
                let filterMessages = [...messages];
                filterMessages = filterMessages.filter(m => m?._id !== res?.message_id);
                setMessages(filterMessages);
                if(method == "DELETE"){
                    socket.emit("message-deleted", JSON.stringify(msg));
                }
              }
              else toast.error(res.message);
      
            }
          });
    }

    return (
        <div className="h-screen overflow-y-auto p-4 pb-40" id="root" ref={elementRef}>
            {
                messages?.map(data => {
                    {
                    const sender = data?.sender;
                    const receiver = data?.receiver;
                        return (receiver?._id == user?._id && data?.status == 2)
                        ? ""
                    : (<div key={data?._id} title="double click to remove" onDoubleClick={(e) => handleRemoveMsg(data)}>
                        {
                            sender?._id == user?._id
                                ?
                                (<div className="mb-3">
                                    <div className="flex justify-end mb-1 cursor-pointer">
                                        <div className="flex max-w-96 bg-indigo-500 text-white rounded-lg p-3 gap-3">
                                            <p>{data?.message?.message}</p>
                                        </div>
                                        <div className="w-9 h-9 rounded-full flex items-center justify-center ml-2">
                                            <img src={getImageURL(user?.photo)} alt="My Avatar" className="border-2 border-red-400 w-8 h-8 rounded-full" title={user?.name} />

                                        </div>
                                    </div>
                                    <div align="right" className="text-xs text-gray-500 mr-10">{dateTimeFormat(data?.message?.createdAt)}
                                    </div>
                                </div>)
                                :
                                (
                                    <div className="mb-3">
                                        <div align="left" className="text-xs text-gray-500 ml-10">{sender?.name}
                                        </div>
                                        <div className="flex mb-1 cursor-pointer">
                                            <div className="w-9 h-9 rounded-full flex items-center justify-center mr-2">
                                                <img src={getImageURL(sender?.photo)} alt="User Avatar" className="border-2 border-red-400 w-8 h-8 rounded-full" title={sender?.name}/>
                                            </div>
                                            <div className="flex max-w-96 bg-white rounded-lg p-3 gap-3">
                                                <p className="text-gray-700">{data?.message?.message}</p>
                                            </div>
                                        </div>
                                        <div align="left" className="text-xs text-gray-500 ml-10">{dateTimeFormat(data?.message?.createdAt)}
                                        </div>
                                    </div>
                                )
                        }
                    </div>)
                    }
                })
            }

        </div>
    )
}

export default Messages