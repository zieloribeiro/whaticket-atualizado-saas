import { proto, WALegacySocket, WASocket } from "@adiwajshing/baileys";
import { getIO } from "../libs/socket";
import Message from "../models/Message";
import Ticket from "../models/Ticket";
import { logger } from "../utils/logger";
import GetTicketWbot from "./GetTicketWbot";

const SetTicketMessagesAsRead = async (ticket: Ticket): Promise<void> => {
  await ticket.update({ unreadMessages: 0 });

  try {
    const wbot = await GetTicketWbot(ticket);
    if (wbot.type === "legacy") {
      const chatMessages = await (wbot as WALegacySocket).fetchMessagesFromWA(
        `${ticket.contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"
        }`,
        100
      );
      chatMessages.forEach(async message => {
        await (wbot as WALegacySocket).chatRead(message.key, 1);
      });
    }

    if (wbot.type === "md") {
      // no baileys temos que marcar cada mensagem como lida
      // não o chat inteiro como é feito no legacy
      const getJsonMessage = await Message.findAll({
        where: {
          ticketId: ticket.id,
          fromMe: false,
          read: false
        },
        order: [["createdAt", "DESC"]]
      });

      if (getJsonMessage.length > 0) {
        const lastMessages: proto.IWebMessageInfo = JSON.parse(
          JSON.stringify(getJsonMessage[0].dataJson)
          );
        
        const key = {
          remoteJid: getJsonMessage[0].remoteJid,
          id: getJsonMessage[0].id
        }

        await (wbot as WASocket).readMessages([key]);
        await ticket.update({ unreadMessages: 0 });

/*         if (lastMessages.key && lastMessages.key.fromMe === false) {
          await (wbot as WASocket).chatModify(
            { markRead: true, lastMessages: [lastMessages] }, `${ticket.contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`
          );
          // await (wbot as WASocket)!.sendReadReceipt(
          //   lastMessages.key.remoteJid,
          //   lastMessages.key.participant,
          //   [lastMessages.key.id]
          // );
        }
        getJsonMessage.forEach(async message => {
          const msg: proto.IWebMessageInfo = JSON.parse(message.dataJson);
          if (msg.key && msg.key.fromMe === false) {
            // await (wbot as WASocket)!.sendReadReceipt(
            //   msg.key.remoteJid,
            //   msg.key.participant,
            //   [msg.key.id]
            // );
          }
        }); */
      }
    }

    await Message.update(
      { read: true },
      {
        where: {
          ticketId: ticket.id,
          read: false
        }
      }
    );
  } catch (err) {
    console.log(err);
    logger.warn(
      `Could not mark messages as read. Maybe whatsapp session disconnected? Err: ${err}`
    );
  }

  const io = getIO();
  io.to(ticket.status).to("notification").emit("ticket", {
    action: "updateUnread",
    ticketId: ticket.id
  });
};

export default SetTicketMessagesAsRead;
