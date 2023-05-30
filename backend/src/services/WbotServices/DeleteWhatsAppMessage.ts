import { proto, WASocket } from "@whiskeysockets/baileys";
import AppError from "../../errors/AppError";
import GetTicketWbot from "../../helpers/GetTicketWbot";
import GetWbotMessage from "../../helpers/GetWbotMessage";
import Message from "../../models/Message";
import Ticket from "../../models/Ticket";

const DeleteWhatsAppMessage = async (messageId: string): Promise<Message> => {



  const message = await Message.findOne({
    where: { id: messageId },
    include: [
      {
        model: Ticket,
        as: "ticket",
        include: ["contact"]
      }
    ]
  });

  if (!message) {
    throw new AppError("No message found with this ID.");
  }

  const { ticket } = message;

  const messageToDelete = await GetWbotMessage(ticket, messageId);

  try {
    const wbot = await GetTicketWbot(ticket);
    const menssageDelete = messageToDelete as Message;

    const jsonStringToParse = JSON.parse(menssageDelete.dataJson)

    await (wbot as WASocket).sendMessage(menssageDelete.remoteJid, {
      delete: jsonStringToParse.key
    })

  } catch (err) {
    console.log(err);
    throw new AppError("ERR_DELETE_WAPP_MSG");
  }
  await message.update({ isDeleted: true });

  return message;
};

export default DeleteWhatsAppMessage;
