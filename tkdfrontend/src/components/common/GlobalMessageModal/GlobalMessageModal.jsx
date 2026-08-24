// src/components/common/GlobalMessageModal/GlobalMessageModal.jsx

import React, {
  useEffect,
  useState,
} from "react";


import {
  GLOBAL_MESSAGE_EVENT,
} from "../../../services/globalMessage";


import "./GlobalMessageModal.css";



const DEFAULT_TITLES = {

  error:
    "خطا",

  success:
    "عملیات موفق",

  warning:
    "هشدار",

  info:
    "اطلاع",

  confirm:
    "تأیید",

};



const ICONS = {

  error:
    "!",

  success:
    "✓",

  warning:
    "!",

  info:
    "i",

  confirm:
    "?",

};




export default function GlobalMessageModal() {


  const [modal,setModal] = useState({

    open:false,

    type:"info",

    title:"",

    messages:[],

    closable:true,

    onClose:null,

    onConfirm:null,

    onCancel:null,

  });





  useEffect(()=>{


    const handleGlobalMessage = (
      event
    )=>{


      const detail =
        event?.detail || {};



      const type = [

        "error",

        "success",

        "warning",

        "info",

        "confirm",

      ].includes(
        detail.type
      )

      ? detail.type

      : "info";





      const messages =

        Array.isArray(
          detail.messages
        )

        ? detail.messages

        :

        detail.messages

        ? [
            detail.messages
          ]

        :

        [];





      setModal({

        open:true,


        type,


        title:

          detail.title ||

          DEFAULT_TITLES[type],



        messages:

          messages.length

          ?

          messages

          :

          [
            "پیامی برای نمایش وجود ندارد."
          ],



        closable:

          detail.closable !== false,



        onClose:

          typeof detail.onClose === "function"

          ?

          detail.onClose

          :

          null,



        onConfirm:

          typeof detail.onConfirm === "function"

          ?

          detail.onConfirm

          :

          null,



        onCancel:

          typeof detail.onCancel === "function"

          ?

          detail.onCancel

          :

          null,


      });


    };




    window.addEventListener(

      GLOBAL_MESSAGE_EVENT,

      handleGlobalMessage

    );




    return ()=>{


      window.removeEventListener(

        GLOBAL_MESSAGE_EVENT,

        handleGlobalMessage

      );


    };


  },[]);








  const closeModal = ()=>{


    if(
      !modal.closable
    ){

      return;

    }




    const callback =
      modal.onClose;



    setModal(prev=>({

      ...prev,

      open:false,

      onClose:null,

      onConfirm:null,

      onCancel:null,

    }));




    if(
      typeof callback === "function"
    ){

      callback();

    }


  };









  useEffect(()=>{


    if(
      !modal.open
    ){

      return;

    }



    const handleKeyDown = (
      event
    )=>{


      if(
        event.key === "Escape" &&
        modal.closable
      ){

        closeModal();

      }


    };




    window.addEventListener(

      "keydown",

      handleKeyDown

    );




    return ()=>{


      window.removeEventListener(

        "keydown",

        handleKeyDown

      );


    };


  },[
    modal.open,
    modal.closable
  ]);









  if(
    !modal.open
  ){

    return null;

  }








  const handleConfirm = ()=>{


    if(
      typeof modal.onConfirm === "function"
    ){

      modal.onConfirm();

    }


    closeModal();


  };





  const handleCancel = ()=>{


    if(
      typeof modal.onCancel === "function"
    ){

      modal.onCancel();

    }


    closeModal();


  };









  return (

    <div

      className="global-message-overlay"

      role="presentation"

      onMouseDown={(event)=>{


        if(

          event.target ===

          event.currentTarget

        ){

          closeModal();

        }


      }}

    >



      <div

        className={[
          "global-message-modal",
          `global-message-${modal.type}`,
        ].join(" ")}

        dir="rtl"

        role="dialog"

        aria-modal="true"

      >



        {
          modal.closable &&

          (

          <button

            type="button"

            className="global-message-close"

            onClick={closeModal}

          >

            ×

          </button>

          )

        }






        <div

          className="global-message-icon"

        >

          {ICONS[modal.type]}


        </div>







        <h3

          className="global-message-title"

        >

          {modal.title}


        </h3>







        <div

          className="global-message-content"

        >


          {
            modal.messages.length === 1

            ?

            (

            <p>

              {modal.messages[0]}

            </p>

            )


            :

            (

            <ul>

              {
                modal.messages.map(

                  (message,index)=>(

                    <li

                      key={`${index}-${message}`}

                    >

                      {message}

                    </li>

                  )

                )

              }


            </ul>

            )

          }


        </div>








        {

          modal.type === "confirm"

          ?

          (

          <div className="global-message-actions">


            <button

              type="button"

              className="global-message-confirm"

              onClick={handleConfirm}

            >

              بله

            </button>




            <button

              type="button"

              className="global-message-cancel"

              onClick={handleCancel}

            >

              خیر

            </button>


          </div>

          )


          :

          (

          modal.closable &&

          <button

            type="button"

            className="global-message-action"

            onClick={closeModal}

          >

            متوجه شدم

          </button>


          )


        }



      </div>


    </div>


  );


}