import { join } from "path";
import { promisify } from "util";
import { writeFile } from "fs";
import * as Sentry from "@sentry/node";
import { isNil, isNull, head } from "lodash";

import {
  WASocket,
  downloadContentFromMessage,
  extractMessageContent,
  getContentType,
  jidNormalizedUser,
  MediaType,
  MessageUpsertType,
  proto,
  WAMessage,
  BinaryNode,
  WAMessageStubType,
  WAMessageUpdate,
  delay,
} from "@whiskeysockets/baileys";
import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";
import Message from "../../models/Message";
import bdTemp from "./Tmp"

import { getIO } from "../../libs/socket";
import CreateMessageService from "../MessageServices/CreateMessageService";
import { logger } from "../../utils/logger";
import CreateOrUpdateContactService from "../ContactServices/CreateOrUpdateContactService";
import FindOrCreateTicketService from "../TicketServices/FindOrCreateTicketService";
import ShowWhatsAppService from "../WhatsappService/ShowWhatsAppService";
import UpdateTicketService from "../TicketServices/UpdateTicketService";
import formatBody from "../../helpers/Mustache";
import TicketTraking from "../../models/TicketTraking";
import UserRating from "../../models/UserRating";
import SendWhatsAppMessage from "./SendWhatsAppMessage";
import moment from "moment";
import Queue from "../../models/Queue";
import QueueOption from "../../models/QueueOption";
import FindOrCreateATicketTrakingService from "../TicketServices/FindOrCreateATicketTrakingService";
import VerifyCurrentSchedule from "../CompanyService/VerifyCurrentSchedule";
import Campaign from "../../models/Campaign";
import CampaignShipping from "../../models/CampaignShipping";
import { Op } from "sequelize";
import { campaignQueue, parseToMilliseconds, randomValue } from "../../queues";
import User from "../../models/User";
import Setting from "../../models/Setting";
import { cacheLayer } from "../../libs/cache";
import { provider } from "./providers";
import { debounce } from "../../helpers/Debounce";

const fs = require('fs')

type Session = WASocket & {
  id?: number;
};

interface ImessageUpsert {
  messages: proto.IWebMessageInfo[];
  type: MessageUpsertType;
}

interface IMe {
  name: string;
  id: string;
}

interface IMessage {
  messages: WAMessage[];
  isLatest: boolean;
}

export const isNumeric = (value: string) => /^-?\d+$/.test(value);

const writeFileAsync = promisify(writeFile);

const getTypeMessage = (msg: proto.IWebMessageInfo): string => {
  try {
    // verificar se o type é um viewOnceMessage
    let type = getContentType(msg.message)

    if (type === "viewOnceMessage") {
      // verificar se msg.message tem listMessage ou buttonMessage
      if (msg?.message?.viewOnceMessage?.message?.listMessage) {
        type = "listMessage"
      }
      if (msg?.message?.viewOnceMessage?.message?.buttonsMessage) {
        type = "buttonsMessage"
      }
      if (msg?.message?.viewOnceMessage?.message) {
        type = getContentType(msg?.message?.viewOnceMessage?.message)
      }
    }

    if (type === "ephemeralMessage") {
      // verificar se msg.message tem listMessage ou buttonMessage
      if (msg?.message?.ephemeralMessage?.message?.listMessage) {
        type = "listMessage"
      }
      if (msg?.message?.ephemeralMessage?.message?.buttonsMessage) {
        type = "buttonsMessage"
      }
      if (msg?.message?.ephemeralMessage?.message?.imageMessage) {
        type = "imageMessage"
      }

      if (msg?.message?.ephemeralMessage?.message?.audioMessage) {
        type = "audioMessage"
      }
      if (msg?.message?.ephemeralMessage?.message?.audioMessage) {
        type = "videoMessage"
      }
      if (msg?.message?.ephemeralMessage?.message?.documentMessage) {
        type = "documentMessage"
      }
      if (msg?.message?.ephemeralMessage?.message?.stickerMessage) {
        type = "stickerMessage"
      }
      if (msg?.message?.ephemeralMessage?.message?.contactMessage) {
        type = "contactMessage"
      }
      if (msg?.message?.ephemeralMessage?.message?.locationMessage) {
        type = "locationMessage"
      }
      if (msg?.message?.ephemeralMessage?.message?.protocolMessage) {
        type = "protocolMessage"
      }
      if (msg?.message?.ephemeralMessage?.message?.viewOnceMessage) {
        type = getContentType(msg?.message?.ephemeralMessage?.message?.viewOnceMessage?.message)
      }
    }
    return type
  } catch (error) {
    Sentry.setExtra('Error getTypeMessage', { msg });
    Sentry.captureException(error);
  }
};

export function validaCpfCnpj(val) {
  if (val.length == 11) {
    var cpf = val.trim();

    cpf = cpf.replace(/\./g, '');
    cpf = cpf.replace('-', '');
    cpf = cpf.split('');

    var v1 = 0;
    var v2 = 0;
    var aux = false;

    for (var i = 1; cpf.length > i; i++) {
      if (cpf[i - 1] != cpf[i]) {
        aux = true;
      }
    }

    if (aux == false) {
      return false;
    }

    for (var i = 0, p = 10; (cpf.length - 2) > i; i++, p--) {
      v1 += cpf[i] * p;
    }

    v1 = ((v1 * 10) % 11);

    if (v1 == 10) {
      v1 = 0;
    }

    if (v1 != cpf[9]) {
      return false;
    }

    for (var i = 0, p = 11; (cpf.length - 1) > i; i++, p--) {
      v2 += cpf[i] * p;
    }

    v2 = ((v2 * 10) % 11);

    if (v2 == 10) {
      v2 = 0;
    }

    if (v2 != cpf[10]) {
      return false;
    } else {
      return true;
    }
  } else if (val.length == 14) {
    var cnpj = val.trim();

    cnpj = cnpj.replace(/\./g, '');
    cnpj = cnpj.replace('-', '');
    cnpj = cnpj.replace('/', '');
    cnpj = cnpj.split('');

    var v1 = 0;
    var v2 = 0;
    var aux = false;

    for (var i = 1; cnpj.length > i; i++) {
      if (cnpj[i - 1] != cnpj[i]) {
        aux = true;
      }
    }

    if (aux == false) {
      return false;
    }

    for (var i = 0, p1 = 5, p2 = 13; (cnpj.length - 2) > i; i++, p1--, p2--) {
      if (p1 >= 2) {
        v1 += cnpj[i] * p1;
      } else {
        v1 += cnpj[i] * p2;
      }
    }

    v1 = (v1 % 11);

    if (v1 < 2) {
      v1 = 0;
    } else {
      v1 = (11 - v1);
    }

    if (v1 != cnpj[12]) {
      return false;
    }

    for (var i = 0, p1 = 6, p2 = 14; (cnpj.length - 1) > i; i++, p1--, p2--) {
      if (p1 >= 2) {
        v2 += cnpj[i] * p1;
      } else {
        v2 += cnpj[i] * p2;
      }
    }

    v2 = (v2 % 11);

    if (v2 < 2) {
      v2 = 0;
    } else {
      v2 = (11 - v2);
    }

    if (v2 != cnpj[13]) {
      return false;
    } else {
      return true;
    }
  } else {
    return false;
  }
}

function timeout(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function sleep(time) {
  await timeout(time);
}
export const sendMessageImage = async (
  wbot: Session,
  contact,
  ticket: Ticket,
  url: string,
  caption: string
) => {

  let sentMessage
  try {
    sentMessage = await wbot.sendMessage(
      `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
      {
        image: url ? { url } : fs.readFileSync(`public/temp/${caption}-${makeid(10)}`),
        fileName: caption,
        caption: caption,
        mimetype: 'image/jpeg'
      }
    );
  } catch (error) {
    sentMessage = await wbot.sendMessage(
      `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
      {
        text: formatBody('Não consegui enviar o PDF, tente novamente!', contact)
      }
    );
  }
  verifyMessage(sentMessage, ticket, contact, ticket.companyId);
};

export const sendMessageLink = async (
  wbot: Session,
  contact: Contact,
  ticket: Ticket,
  url: string,
  caption: string
) => {

  let sentMessage
  try {
    sentMessage = await wbot.sendMessage(
      `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`, {
      document: url ? { url } : fs.readFileSync(`public/temp/${caption}-${makeid(10)}`),
      fileName: caption,
      caption: caption,
      mimetype: 'application/pdf'
    }
    );
  } catch (error) {
    sentMessage = await wbot.sendMessage(
      `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`, {
      text: formatBody('Não consegui enviar o PDF, tente novamente!', contact)
    }
    );
  }
  verifyMessage(sentMessage, ticket, contact, ticket.companyId);
};

export function makeid(length) {
  var result = '';
  var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  var charactersLength = characters.length;
  for (var i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}



const msgLocation = (image, latitude, longitude) => {
  if (image) {
    var b64 = Buffer.from(image).toString("base64");

    let data = `data:image/png;base64, ${b64} | https://maps.google.com/maps?q=${latitude}%2C${longitude}&z=17&hl=pt-BR|${latitude}, ${longitude} `;
    return data;
  }
};

export const getBodyMessage = async (msg: proto.IWebMessageInfo): Promise<string> => {
  function getBodyButton(msg: proto.IWebMessageInfo): string | null {
    try {

      if (msg?.message?.buttonsMessage?.contentText) {
        let bodyMessage = `*${msg?.message?.buttonsMessage?.contentText}*`;
        for (const buton of msg.message?.buttonsMessage?.buttons) {
          bodyMessage += `\n\n${buton.buttonText.displayText}`;
        }
        return bodyMessage;
      } else
        if (msg?.message?.listMessage) {
          let bodyMessage = `*${msg?.message?.listMessage?.description}*`;
          for (const buton of msg.message?.listMessage?.sections[0]?.rows) {
            bodyMessage += `\n\n${buton.title}`;
          }
          return bodyMessage;

        }
      if (msg.message?.viewOnceMessage?.message?.listMessage) {

        let obj = msg.message?.viewOnceMessage?.message.listMessage;
        let bodyMessage = `*${obj.description}*`;
        for (const buton of obj.sections[0]?.rows) {
          bodyMessage += `\n\n${buton.title}`;
        }

        return bodyMessage;
      }
      if (msg.message?.viewOnceMessage?.message?.buttonsMessage) {

        let obj = msg.message?.viewOnceMessage?.message.buttonsMessage;
        let bodyMessage = `*${obj.contentText}*`;
        for (const buton of obj?.buttons) {
          bodyMessage += `\n\n${buton.buttonText.displayText}`;
        }
        return bodyMessage;

      }
    } catch (error) {
      logger.error(error);
    }

  }
  try {
    const type = getTypeMessage(msg);
    if (!type) {
      console.log("não achou o  type 90");
      return;
    }


    const types = {
      "conversation": msg.message.conversation,
      "imageMessage": msg.message.imageMessage?.caption || "image",
      "videoMessage": msg.message.videoMessage?.caption || "video",
      "extendedTextMessage": getBodyButton(msg) || msg.message.extendedTextMessage?.text || msg.message?.listMessage?.description,
      "buttonsResponseMessage": msg.message.buttonsResponseMessage?.selectedDisplayText,
      "listResponseMessage": msg?.message?.listResponseMessage?.title || "Chegou Aqui",
      "templateButtonReplyMessage": msg.message?.templateButtonReplyMessage?.selectedId,
      "messageContextInfo": msg.message.buttonsResponseMessage?.selectedButtonId ||
        msg.message.listResponseMessage?.title,
      "buttonsMessage": getBodyButton(msg) || msg.message.listResponseMessage?.title,
      "stickerMessage": "sticker",
      "contactMessage": msg.message.contactMessage?.vcard,
      "contactsArrayMessage": "varios contatos",
      "locationMessage": `Latitude: ${msg.message.locationMessage?.degreesLatitude} - Longitude: ${msg.message.locationMessage?.degreesLongitude}`,
      "liveLocationMessage": `Latitude: ${msg.message.liveLocationMessage?.degreesLatitude} - Longitude: ${msg.message.liveLocationMessage?.degreesLongitude}`,
      "documentMessage": msg.message.documentMessage?.title,
      "audioMessage": "Áudio",
      "reactionMessage": msg.message?.reactionMessage?.text,
      "ephemeralMessage": msg.message?.ephemeralMessage?.message?.extendedTextMessage?.text,
      "protocolMessage": msg.message?.protocolMessage?.type || msg.message?.ephemeralMessage?.message?.protocolMessage?.type,
      "listMessage": getBodyButton(msg) || msg.message?.listMessage?.description,
      "viewOnceMessage": getBodyButton(msg),
      "documentWithCaptionMessage": msg.message?.documentWithCaptionMessage?.message?.documentMessage?.caption,

    }

    const objKey = Object.keys(types).find(objKey => objKey === type);

    if (!objKey) {
      logger.warn(`#### Nao achou o type em getBodyMessage: ${type}
${JSON.stringify(msg?.message)}`);
      Sentry.setExtra('Mensagem', { BodyMsg: msg.message, msg, type });
      Sentry.captureException(new Error("Novo Tipo de Mensagem em getBodyMessage"));
    }

    return types[type];

  } catch (error) {
    Sentry.setExtra('Error getTypeMessage', { msg, BodyMsg: msg.message });
    Sentry.captureException(error);
    console.log(error);
  }
};

export const getQuotedMessage = (msg: proto.IWebMessageInfo): any => {
  const body =
    msg.message.imageMessage.contextInfo ||
    msg.message.videoMessage.contextInfo ||
    msg.message.extendedTextMessage.contextInfo ||
    msg.message.buttonsResponseMessage.contextInfo ||
    msg.message.listResponseMessage.contextInfo ||
    msg.message.templateButtonReplyMessage.contextInfo ||
    msg.message.buttonsResponseMessage?.contextInfo ||
    msg.message.listResponseMessage?.contextInfo;
  // testar isso

  return extractMessageContent(body[Object.keys(body).values().next().value]);
};

export const getQuotedMessageId = (msg: proto.IWebMessageInfo) => {
  const body = extractMessageContent(msg.message)[
    Object.keys(msg?.message).values().next().value
  ];
  let reaction = msg?.message?.reactionMessage ? msg?.message?.reactionMessage?.key?.id : "";

  return reaction ? reaction : body?.contextInfo?.stanzaId;
};

const getMeSocket = (wbot: Session): IMe => {

  return {
    id: jidNormalizedUser((wbot as WASocket).user.id),
    name: (wbot as WASocket).user.name
  }
};

const getSenderMessage = (
  msg: proto.IWebMessageInfo,
  wbot: Session
): string => {
  const me = getMeSocket(wbot);
  if (msg.key.fromMe) return me.id;

  const senderId = msg.participant || msg.key.participant || msg.key.remoteJid || undefined;

  return senderId && jidNormalizedUser(senderId);
};

const getContactMessage = async (msg: proto.IWebMessageInfo, wbot: Session) => {

  const isGroup = msg.key.remoteJid.includes("g.us");
  const rawNumber = msg.key.remoteJid.replace(/\D/g, "");
  return isGroup
    ? {
      id: getSenderMessage(msg, wbot),
      name: msg.pushName
    }
    : {
      id: msg.key.remoteJid,
      name: msg.key.fromMe ? rawNumber : msg.pushName
    };
};

const downloadMedia = async (msg: proto.IWebMessageInfo) => {
  const mineType =
    msg.message?.imageMessage ||
    msg.message?.audioMessage ||
    msg.message?.videoMessage ||
    msg.message?.stickerMessage ||
    msg.message?.documentMessage ||
    msg.message?.documentWithCaptionMessage?.message?.documentMessage ||
    msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage ||
    msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.videoMessage;


  let messageType = mineType.mimetype
    .split("/")[0]
    .replace("application", "document")
    ? (mineType.mimetype
      .split("/")[0]
      .replace("application", "document") as MediaType)
    : (mineType.mimetype.split("/")[0] as MediaType);

  let stream;
  let contDownload = 0;

  if (msg.message.documentMessage || msg.message.documentWithCaptionMessage) {
    messageType = "document";
  }

  while (contDownload < 10 && !stream) {
    try {
      contDownload > 1
        ? logger.warn(`Tentativa ${contDownload} de baixar o arquivo`)
        : "";

      stream = await downloadContentFromMessage(
        msg.message.audioMessage ||
        msg.message.videoMessage ||
        msg.message.documentMessage ||
        msg.message.documentWithCaptionMessage?.message?.documentMessage ||
        msg.message.imageMessage ||
        msg.message.stickerMessage ||
        msg.message.extendedTextMessage?.contextInfo.quotedMessage
          .imageMessage ||
        msg.message.extendedTextMessage?.contextInfo.quotedMessage
          .videoMessage ||
        msg.message?.buttonsMessage?.imageMessage ||
        msg.message?.templateMessage?.fourRowTemplate?.imageMessage ||
        msg.message?.templateMessage?.hydratedTemplate?.imageMessage ||
        msg.message?.templateMessage?.hydratedFourRowTemplate?.imageMessage ||
        msg.message?.interactiveMessage?.header?.imageMessage,
        messageType
      );
    } catch (error) {
      contDownload++;
      await new Promise(resolve =>
        setTimeout(resolve, 1000 * contDownload * 2)
      );
      logger.warn(`>>>> erro ${contDownload} de baixar o arquivo`);
    }
  }

  let buffer = Buffer.from([]);
  // eslint-disable-next-line no-restricted-syntax
  try {
    for await (const chunk of stream) {
      buffer = Buffer.concat([buffer, chunk]);
    }
  } catch (error) {
    return { data: "error", mimetype: "", filename: "" };
  }

  if (!buffer) {
    Sentry.setExtra("ERR_WAPP_DOWNLOAD_MEDIA", { msg });
    Sentry.captureException(new Error("ERR_WAPP_DOWNLOAD_MEDIA"));
    throw new Error("ERR_WAPP_DOWNLOAD_MEDIA");
  }
  let filename = msg.message?.documentMessage?.fileName || "";

  if (!filename) {
    const ext = mineType.mimetype.split("/")[1].split(";")[0];
    filename = `${new Date().getTime()}.${ext}`;
  } else {
    filename = `${new Date().getTime()}_${filename}`;
  }
  const media = {
    data: buffer,
    mimetype: mineType.mimetype,
    filename
  };
  return media;
};


const verifyContact = async (
  msgContact: IMe,
  wbot: Session,
  companyId: number
): Promise<Contact> => {
  let profilePicUrl: string;
  try {
    profilePicUrl = await wbot.profilePictureUrl(msgContact.id);
  } catch (e) {
    Sentry.captureException(e);
    profilePicUrl = `${process.env.FRONTEND_URL}/nopicture.png`;
  }

  const contactData = {
    name: msgContact?.name || msgContact.id.replace(/\D/g, ""),
    number: msgContact.id.replace(/\D/g, ""),
    profilePicUrl,
    isGroup: msgContact.id.includes("g.us"),
    companyId,
  };



  const contact = CreateOrUpdateContactService(contactData);

  return contact;
};

const verifyQuotedMessage = async (
  msg: proto.IWebMessageInfo
): Promise<Message | null> => {
  if (!msg) return null;
  const quoted = getQuotedMessageId(msg);
  if (!quoted) return null;

  const quotedMsg = await Message.findOne({
    where: { wid: quoted },
  });

  if (!quotedMsg) return null;

  return quotedMsg;
};

export const verifyMediaMessage = async (
  msg: proto.IWebMessageInfo,
  ticket: Ticket,
  contact: Contact,
  companyId: number
): Promise<Message> => {
  const quotedMsg = await verifyQuotedMessage(msg);
  try {

    const media = await downloadMedia(msg);

    if (media.data === "error") {
      throw new Error("ERR_WAPP_DOWNLOAD_MEDIA");
    }

    if (!media) {
      throw new Error("ERR_WAPP_DOWNLOAD_MEDIA");
    }

    if (!media.filename) {
      const ext = media.mimetype.split("/")[1].split(";")[0];
      media.filename = `${new Date().getTime()}.${ext}`;
    } else {
      // ext = tudo depois do ultimo .
      const ext = media.filename.split(".").pop();
      // name = tudo antes do ultimo .
      const name = media.filename.split(".").slice(0, -1).join(".").replace(/\s/g, '_').normalize("NFD").replace(/[\u0300-\u036f]/g, "");

      media.filename = `${name.trim()}_${new Date().getTime()}.${ext}`;
    }

    try {
      await writeFileAsync(
        join(__dirname, "..", "..", "..", "public", media.filename),
        media.data,
        "base64"
      );
    } catch (err) {
      Sentry.setExtra('Erro midea', { companyId, ticket, contact, media, quotedMsg });
      Sentry.captureException(err);
      logger.error(err);
    }

    const body = await getBodyMessage(msg);
    const messageData = {
      wid: msg.key.id,
      ticketId: ticket.id,
      contactId: msg.key.fromMe ? undefined : contact.id,
      body: body ? body : media.filename,
      fromMe: msg.key.fromMe,
      read: msg.key.fromMe,
      mediaUrl: media.filename,
      mediaType: media.mimetype.split("/")[0],
      quotedMsgId: quotedMsg?.id,
      ack: msg.status,
      remoteJid: msg.key.remoteJid,
      participant: msg.key.participant,
      dataJson: JSON.stringify(msg),
      companyId,
    };

    await ticket.update({
      lastMessage: body ? body : media.filename,
    });
    const newMessage = await CreateMessageService({
      messageData,
      companyId: ticket.companyId,
    });

    return newMessage;
  } catch (error) {
    logger.warn("Erro ao baixar media");
  }
};

export const verifyMessage = async (
  msg: proto.IWebMessageInfo,
  ticket: Ticket,
  contact: Contact,
  companyId: number
) => {
  const quotedMsg = await verifyQuotedMessage(msg);
  const body = await getBodyMessage(msg);

  const messageData = {
    wid: msg.key.id,
    ticketId: ticket.id,
    contactId: msg.key.fromMe ? undefined : contact.id,
    body: body,
    fromMe: msg.key.fromMe,
    mediaType: getTypeMessage(msg),
    read: msg.key.fromMe,
    quotedMsgId: quotedMsg?.id,
    ack: msg.status,
    remoteJid: msg.key.remoteJid,
    participant: msg.key.participant,
    dataJson: JSON.stringify(msg),
  };
  await ticket.update({
    lastMessage: body,
  });

  if (messageData.remoteJid.includes("g.us")) {
    messageData.ack = 3;
  }

  try {
    await CreateMessageService({
      messageData,
      companyId: ticket.companyId,
    });
  } catch (error) {
    console.log(error)
  }
};


const isValidMsg = (msg: proto.IWebMessageInfo): boolean => {
  if (msg.key.remoteJid === "status@broadcast") return false;
  try {
    const msgType = getTypeMessage(msg);
    if (!msgType) {
      return;
    }


    const ifType =
      msgType === "conversation" ||
      msgType === "extendedTextMessage" ||
      msgType === "audioMessage" ||
      msgType === "videoMessage" ||
      msgType === "imageMessage" ||
      msgType === "documentMessage" ||
      msgType === "stickerMessage" ||
      msgType === "buttonsResponseMessage" ||
      msgType === "buttonsMessage" ||
      msgType === "messageContextInfo" ||
      msgType === "locationMessage" ||
      msgType === "liveLocationMessage" ||
      msgType === "contactMessage" ||
      msgType === "voiceMessage" ||
      msgType === "mediaMessage" ||
      msgType === "contactsArrayMessage" ||
      msgType === "reactionMessage" ||
      msgType === "ephemeralMessage" ||
      msgType === "protocolMessage" ||
      msgType === "listResponseMessage" ||
      msgType === "listMessage" ||
      msgType === "viewOnceMessage" ||
      msgType === "documentWithCaptionMessage";

    console.log('tipo', ifType)

    if (!ifType) {
      logger.warn(`#### Nao achou o type em isValidMsg: ${msgType}
${JSON.stringify(msg?.message)}`);
      Sentry.setExtra('Mensagem', { BodyMsg: msg.message, msg, msgType });
      Sentry.captureException(new Error("Novo Tipo de Mensagem em isValidMsg"));
    }

    return !!ifType;
  } catch (error) {
    Sentry.setExtra('Error isValidMsg', { msg });
    Sentry.captureException(error);
  }

};
const Push = (msg: proto.IWebMessageInfo) => {
  return msg.pushName;
}

const verifyQueue = async (
  wbot: Session,
  msg: proto.IWebMessageInfo,
  ticket: Ticket,
  contact: Contact
) => {
  const { queues, greetingMessage } = await ShowWhatsAppService(
    wbot.id!,
    ticket.companyId
  )



  if (queues.length === 1) {
    const firstQueue = head(queues);
    let chatbot = false;
    if (firstQueue?.options) {
      chatbot = firstQueue.options.length > 0;
    }
    await UpdateTicketService({
      ticketData: { queueId: firstQueue?.id, chatbot },
      ticketId: ticket.id,
      companyId: ticket.companyId,
    });

    return;
  }

  const selectedOption = msg?.message?.buttonsResponseMessage?.selectedButtonId ||
    msg?.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
    msg?.message?.extendedTextMessage?.text ||
    msg?.message?.conversation;


  const choosenQueue = queues[+selectedOption - 1];

  const companyId = ticket.companyId;

  const buttonActive = await Setting.findOne({
    where: {
      key: "chatBotType",
      companyId
    }
  });


  const botList = async () => {
    const sectionsRows = [];

    queues.forEach((queue, index) => {
      sectionsRows.push({
        title: queue.name,
        rowId: `${index + 1}`
      });
    });

    const sections = [
      {
        rows: sectionsRows
      }
    ];

    const listMessage = {
      text: formatBody(`\u200e${greetingMessage}`, contact),
      buttonText: "Escolha uma opção",
      sections
    };

    const sendMsg = await wbot.sendMessage(
      `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
      listMessage
    );

    await verifyMessage(sendMsg, ticket, ticket.contact, ticket.companyId);
  }

  const botButton = async () => {
    const buttons = [];
    queues.forEach((queue, index) => {
      buttons.push({
        buttonId: `${index + 1}`,
        buttonText: { displayText: queue.name },
        type: 4
      });
    });

    const buttonMessage = {
      text: formatBody(`\u200e${greetingMessage}`, contact),
      buttons,
      headerType: 4
    };

    const sendMsg = await wbot.sendMessage(
      `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
      buttonMessage
    );

    await verifyMessage(sendMsg, ticket, ticket.contact, ticket.companyId);
  }

  const botText = async () => {
    let options = "";

    queues.forEach((queue, index) => {
      options += `*[ ${index + 1} ]* - ${queue.name}\n`;
    });


    const textMessage = {
      text: formatBody(`\u200e${greetingMessage}\n\n${options}`, contact),
    };

    const sendMsg = await wbot.sendMessage(
      `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
      textMessage
    );

    await verifyMessage(sendMsg, ticket, ticket.contact, ticket.companyId);
  };

  if (choosenQueue) {
    let chatbot = false;
    if (choosenQueue?.options) {
      chatbot = choosenQueue.options.length > 0;
    }
    await UpdateTicketService({
      ticketData: { queueId: choosenQueue.id, chatbot },
      ticketId: ticket.id,
      companyId: ticket.companyId,
    });


    /* Tratamento para envio de mensagem quando a fila está fora do expediente */
    if (choosenQueue.options.length === 0) {
      const queue = await Queue.findByPk(choosenQueue.id);
      const { schedules }: any = queue;
      const now = moment();
      const weekday = now.format("dddd").toLowerCase();
      let schedule;
      if (Array.isArray(schedules) && schedules.length > 0) {
        schedule = schedules.find((s) => s.weekdayEn === weekday && s.startTime !== "" && s.startTime !== null && s.endTime !== "" && s.endTime !== null);
      }

      if (queue.outOfHoursMessage !== null && queue.outOfHoursMessage !== "" && !isNil(schedule)) {
        const startTime = moment(schedule.startTime, "HH:mm");
        const endTime = moment(schedule.endTime, "HH:mm");

        if (now.isBefore(startTime) || now.isAfter(endTime)) {
          const body = formatBody(`${queue.outOfHoursMessage}\n\n*[ # ]* - Voltar ao Menu Principal`, ticket.contact);
          const sentMessage = await wbot.sendMessage(
            `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`, {
            text: body,
          }
          );
          await verifyMessage(sentMessage, ticket, contact, ticket.companyId);
          await UpdateTicketService({
            ticketData: { queueId: null, chatbot },
            ticketId: ticket.id,
            companyId: ticket.companyId,
          });
          return;
        }
      }

      const body = formatBody(`${choosenQueue.greetingMessage}`, ticket.contact
      );
      const sentMessage = await wbot.sendMessage(
        `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`, {
        text: body,
      }
      );
      await verifyMessage(sentMessage, ticket, contact, ticket.companyId);
    }

  } else {
    if (buttonActive.value === "list") {
      return botList();
    };

    if (buttonActive.value === "button" && queues.length <= 4) {
      return botButton();
    }

    if (buttonActive.value === "text") {
      return botText();
    }

    if (buttonActive.value === "button" && queues.length > 4) {
      return botText();
    }

  }

};


export const verifyRating = (ticketTraking: TicketTraking) => {
  if (
    ticketTraking &&
    ticketTraking.finishedAt === null &&
    ticketTraking.userId !== null &&
    ticketTraking.ratingAt !== null
  ) {
    return true;
  }
  return false;
};

const handleRating = async (
  msg: WAMessage,
  ticket: Ticket,
  ticketTraking: TicketTraking
) => {
  const io = getIO();
  let rate: number | null = null;

  const bodyMessage = await getBodyMessage(msg);

  if (bodyMessage) {
    rate = +bodyMessage;
  }

  if (!Number.isNaN(rate) && Number.isInteger(rate) && !isNull(rate)) {
    const { complationMessage } = await ShowWhatsAppService(
      ticket.whatsappId,
      ticket.companyId
    );

    let finalRate = rate;

    if (rate < 1) {
      finalRate = 1;
    }
    if (rate > 3) {
      finalRate = 3;
    }

    await UserRating.create({
      ticketId: ticketTraking.ticketId,
      companyId: ticketTraking.companyId,
      userId: ticketTraking.userId,
      rate: finalRate
    });

    const body = formatBody(`\u200e${complationMessage}`, ticket.contact);
    await SendWhatsAppMessage({ body, ticket });

    await ticketTraking.update({
      finishedAt: moment().toDate(),
      rated: true
    });

    await ticket.update({
      queueId: null,
      userId: null,
      status: "closed"
    });

    io.to("open").emit(`company-${ticket.companyId}-ticket`, {
      action: "delete",
      ticket,
      ticketId: ticket.id
    });

    io.to(ticket.status)
      .to(ticket.id.toString())
      .emit(`company-${ticket.companyId}-ticket`, {
        action: "update",
        ticket,
        ticketId: ticket.id
      });
  }
};

const handleChartbot = async (ticket: Ticket, msg: WAMessage, wbot: Session, dontReadTheFirstQuestion: boolean = false) => {



  const queue = await Queue.findByPk(ticket.queueId, {
    include: [
      {
        model: QueueOption,
        as: "options",
        where: { parentId: null },
        order: [
          ["option", "ASC"],
          ["createdAt", "ASC"],
        ],
      },
    ],
  });




  const messageBody = msg?.message?.buttonsResponseMessage?.selectedButtonId ||
    msg?.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
    msg?.message?.extendedTextMessage?.text ||
    msg?.message?.conversation;

  if (messageBody == "#") {
    // voltar para o menu inicial
    await ticket.update({ queueOptionId: null, chatbot: false, queueId: null });
    await verifyQueue(wbot, msg, ticket, ticket.contact);
    return;
  }

  // voltar para o menu anterior
  if (!isNil(queue) && !isNil(ticket.queueOptionId) && messageBody == "#") {
    const option = await QueueOption.findByPk(ticket.queueOptionId);
    await ticket.update({ queueOptionId: option?.parentId });

    // escolheu uma opção
  } else if (!isNil(queue) && !isNil(ticket.queueOptionId)) {
    const count = await QueueOption.count({
      where: { parentId: ticket.queueOptionId },
    });
    let option: any = {};
    if (count == 1) {
      option = await QueueOption.findOne({
        where: { parentId: ticket.queueOptionId },
      });
    } else {
      option = await QueueOption.findOne({
        where: {
          option: messageBody || "",
          parentId: ticket.queueOptionId,
        },
      });
    }
    if (option) {
      await ticket.update({ queueOptionId: option?.id });
    }

    // não linha a primeira pergunta
  } else if (!isNil(queue) && isNil(ticket.queueOptionId) && !dontReadTheFirstQuestion) {
    const option = queue?.options.find((o) => o.option == messageBody);
    if (option) {
      await ticket.update({ queueOptionId: option?.id });
    }
  }

  await ticket.reload();

  if (!isNil(queue) && isNil(ticket.queueOptionId)) {

    const queueOptions = await QueueOption.findAll({
      where: { queueId: ticket.queueId, parentId: null },
      order: [
        ["option", "ASC"],
        ["createdAt", "ASC"],
      ],
    });

    const companyId = ticket.companyId;

    const buttonActive = await Setting.findOne({
      where: {
        key: "chatBotType",
        companyId
      }
    });

    const botList = async () => {
      const sectionsRows = [];

      queueOptions.forEach((option, i) => {
        sectionsRows.push({
          title: option.title,
          rowId: `${option.option}`
        });
      });
      sectionsRows.push({
        title: "Voltar Menu Inicial",
        rowId: `#`
      });
      const sections = [
        {
          rows: sectionsRows
        }
      ];

      const listMessage = {
        text: formatBody(`\u200e${queue.greetingMessage}`, ticket.contact),
        buttonText: "Escolha uma opção",
        sections
      };

      const sendMsg = await wbot.sendMessage(
        `${ticket.contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
        listMessage
      );

      await verifyMessage(sendMsg, ticket, ticket.contact, ticket.companyId);
    }

    const botButton = async () => {
      const buttons = [];
      queueOptions.forEach((option, i) => {
        buttons.push({
          buttonId: `${option.option}`,
          buttonText: { displayText: option.title },
          type: 4
        });
      });
      buttons.push({
        buttonId: `#`,
        buttonText: { displayText: "Voltar Menu Inicial" },
        type: 4
      });

      const buttonMessage = {
        text: formatBody(`\u200e${queue.greetingMessage}`, ticket.contact),
        buttons,
        headerType: 4
      };

      const sendMsg = await wbot.sendMessage(
        `${ticket.contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
        buttonMessage
      );

      await verifyMessage(sendMsg, ticket, ticket.contact, ticket.companyId);
    }

    const botText = async () => {
      let options = "";

      queueOptions.forEach((option, i) => {
        options += `*[ ${option.option} ]* - ${option.title}\n`;
      });
      options += `\n*[ # ]* - Voltar Menu Inicial`;

      const textMessage = {
        text: formatBody(`\u200e${queue.greetingMessage}\n\n${options}`, ticket.contact),
      };

      const sendMsg = await wbot.sendMessage(
        `${ticket.contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
        textMessage
      );

      await verifyMessage(sendMsg, ticket, ticket.contact, ticket.companyId);
    };

    if (buttonActive.value === "list") {
      return botList();
    };

    if (buttonActive.value === "button" && QueueOption.length <= 4) {
      return botButton();
    }

    if (buttonActive.value === "text") {
      return botText();
    }

    if (buttonActive.value === "button" && QueueOption.length > 4) {
      return botText();
    }
  } else if (!isNil(queue) && !isNil(ticket.queueOptionId)) {
    const currentOption = await QueueOption.findByPk(ticket.queueOptionId);
    const queueOptions = await QueueOption.findAll({
      where: { parentId: ticket.queueOptionId },
      order: [
        ["option", "ASC"],
        ["createdAt", "ASC"],
      ],
    });


    if (queueOptions.length == 0) {
      const textMessage = {
        text: formatBody(`${currentOption.message}`, ticket.contact),
      };

      const lastMessageFromMe = await Message.findOne({
        where: {
          ticketId: ticket.id,
          fromMe: true,
          body: textMessage.text
        },
        order: [["createdAt", "DESC"]]
      });

      if (lastMessageFromMe) {
        return;
      }

      const sendMsg = await wbot.sendMessage(
        `${ticket.contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
        textMessage
      );

      await verifyMessage(sendMsg, ticket, ticket.contact, ticket.companyId);

      return
    }

    if (queueOptions.length > 1) {

      const companyId = ticket.companyId;
      const buttonActive = await Setting.findOne({
        where: {
          key: "chatBotType",
          companyId
        }
      });

      const botList = async () => {
        const sectionsRows = [];

        queueOptions.forEach((option, i) => {
          sectionsRows.push({
            title: option.title,
            rowId: `${option.option}`
          });
        });
        sectionsRows.push({
          title: "Voltar Menu Inicial",
          rowId: `#`
        });
        const sections = [
          {
            rows: sectionsRows
          }
        ];

        const listMessage = {
          text: formatBody(`\u200e${currentOption.message}`, ticket.contact),
          buttonText: "Escolha uma opção",
          sections
        };

        const sendMsg = await wbot.sendMessage(
          `${ticket.contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
          listMessage
        );

        await verifyMessage(sendMsg, ticket, ticket.contact, ticket.companyId);
      }

      const botButton = async () => {
        const buttons = [];
        queueOptions.forEach((option, i) => {
          buttons.push({
            buttonId: `${option.option}`,
            buttonText: { displayText: option.title },
            type: 4
          });
        });
        buttons.push({
          buttonId: `#`,
          buttonText: { displayText: "Voltar Menu Inicial" },
          type: 4
        });

        const buttonMessage = {
          text: formatBody(`\u200e${currentOption.message}`, ticket.contact),
          buttons,
          headerType: 4
        };

        const sendMsg = await wbot.sendMessage(
          `${ticket.contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
          buttonMessage
        );

        await verifyMessage(sendMsg, ticket, ticket.contact, ticket.companyId);
      }

      const botText = async () => {

        let options = "";

        queueOptions.forEach((option, i) => {
          options += `*[ ${option.option} ]* - ${option.title}\n`;
        });
        options += `\n*[ # ]* - Voltar Menu Inicial`;

        const textMessage = {
          text: formatBody(`\u200e${currentOption.message}\n\n${options}`, ticket.contact),
        };

        const sendMsg = await wbot.sendMessage(
          `${ticket.contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
          textMessage
        );

        await verifyMessage(sendMsg, ticket, ticket.contact, ticket.companyId);
      };

      if (buttonActive.value === "list") {
        return botList();
      };

      if (buttonActive.value === "button" && QueueOption.length <= 4) {
        return botButton();
      }

      if (buttonActive.value === "text") {
        return botText();
      }

      if (buttonActive.value === "button" && QueueOption.length > 4) {
        return botText();
      }
    }
  }
}

const handleMessage = async (
  msg: proto.IWebMessageInfo,
  wbot: Session,
  companyId: number
): Promise<void> => {
  if (!isValidMsg(msg)) return;
  try {
    let msgContact: IMe;
    let groupContact: Contact | undefined;

    const isGroup = msg.key.remoteJid?.endsWith("@g.us");

    const msgIsGroupBlock = await Setting.findOne({
      where: {
        companyId,
        key: "CheckMsgIsGroup",
      },
    });

    const bodyMessage = await getBodyMessage(msg);
    const msgType = getTypeMessage(msg);

    if (msgType === "protocolMessage") return; // Tratar isso no futuro para excluir msgs se vor REVOKE
    const hasMedia =
      msg.message?.audioMessage ||
      msg.message?.imageMessage ||
      msg.message?.videoMessage ||
      msg.message?.documentMessage ||
      msg.message.stickerMessage ||
      msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage ||
      msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.videoMessage ||
      msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.audioMessage ||
      msg?.message?.ephemeralMessage?.message?.imageMessage ||
      msg?.message?.ephemeralMessage?.message?.audioMessage ||
      msg?.message?.ephemeralMessage?.message?.videoMessage ||
      msg?.message?.ephemeralMessage?.message?.documentMessage ||
      msg?.message?.ephemeralMessage?.message?.stickerMessage ||
      msg.message?.viewOnceMessage?.message?.imageMessage ||
      msg.message?.viewOnceMessage?.message?.videoMessage ||
      msg.message?.ephemeralMessage?.message?.viewOnceMessage?.message?.imageMessage ||
      msg.message?.ephemeralMessage?.message?.viewOnceMessage?.message?.videoMessage ||
      msg.message?.documentWithCaptionMessage?.message?.documentMessage;


    if (msg.key.fromMe) {
      if (/\u200e/.test(bodyMessage)) return;
      if (
        !hasMedia &&
        msgType !== "conversation" &&
        msgType !== "extendedTextMessage" &&
        msgType !== "vcard" &&
        msgType !== "reactionMessage" &&
        msgType !== "ephemeralMessage" &&
        msgType !== "protocolMessage"
      )
        return;
      msgContact = await getContactMessage(msg, wbot);
    } else {
      msgContact = await getContactMessage(msg, wbot);
    }

    if (msgIsGroupBlock?.value === "enabled" && isGroup) return;

    if (isGroup) {
      try {

        //Verificar se bdTemp[msg.key.remoteJid] tem createdAt e se ja tem mais de 10 minutos em relação ao momento atual
        if (bdTemp[msg.key.remoteJid] && bdTemp[msg.key.remoteJid]?.grupo?.createdAt && bdTemp[msg.key.remoteJid].grupo) {
          const createdAt = bdTemp[msg.key.remoteJid]?.grupo.createdAt;
          const now = new Date();
          const diff = now.getTime() - createdAt.getTime();
          const minutes = Math.floor(diff / 60000);

          if (minutes > 10) {
            //sleep de meio segundo para evitar bloqueio
            await new Promise(resolve => setTimeout(resolve, 500));
            let temp = await wbot.groupMetadata(msg.key.remoteJid);
            temp["createdAt"] = new Date();
            bdTemp[msg.key.remoteJid].grupo = temp
          }
        } else {
          await new Promise(resolve => setTimeout(resolve, 500));
          let temp = await wbot.groupMetadata(msg.key.remoteJid);
          temp["createdAt"] = new Date();
          bdTemp[msg.key.remoteJid] = { grupo: temp, ...bdTemp[msg.key.remoteJid] };
        }

        const grupoMeta = bdTemp[msg.key.remoteJid].grupo;

        const msgGroupContact = {
          id: grupoMeta.id,
          name: grupoMeta.subject,
        };
        groupContact = await verifyContact(msgGroupContact, wbot, companyId);
        if (bodyMessage && bodyMessage.toUpperCase() === "##KEYGROUP") {

          const sentMessage = await wbot.sendMessage(
            `${msg.key.remoteJid}`,
            {
              text: `Grupo id: ${grupoMeta.id} \nNome: ${grupoMeta.subject} \nQtd Participantes: ${grupoMeta.participants.length}\n \nParticipantes:\n${grupoMeta.participants.map((participant: { id: any; admin: any; }) => `${participant.id} ${participant.admin ? participant.admin : ""}`).join("\n")}`,
            }
          );
        }
        if (bodyMessage && bodyMessage.toUpperCase() === "##REAJA") {
          const emoticons = ['🤘🏽', '💖', '👏🏻', '🙏🏻', '🤓']
          const reactionMessage = {
            react: {
              text: emoticons[Math.floor(Math.random() * emoticons.length)] || '😬',
              key: msg.key
            }
          }
          const sentMessage = await wbot.sendMessage(
            `${msg.key.remoteJid}`, reactionMessage)
        }
      } catch (err) {
        console.log(err);
        Sentry.setExtra('Error isGroup', { companyId, msg, });
        Sentry.captureException(err);
        logger.error(`Error isGroup: Err: ${err}`);
        throw new Error("ERR_ISGROUP_LISTNER");
      }
    }

    const whatsapp = await ShowWhatsAppService(wbot.id!, companyId);
    const contact = await verifyContact(msgContact, wbot, companyId);

    let unreadMessages = 0;


    if (msg.key.fromMe) {
      await cacheLayer.set(`contacts:${contact.id}:unreads`, "0");
    } else {
      const unreads = await cacheLayer.get(`contacts:${contact.id}:unreads`);
      unreadMessages = +unreads + 1;
      await cacheLayer.set(
        `contacts:${contact.id}:unreads`,
        `${unreadMessages}`
      );
    }


    if (unreadMessages === 0 && formatBody(whatsapp.complationMessage, contact) === formatBody(bodyMessage, contact)) {
      return;
    }

    const ticket = await FindOrCreateTicketService(contact, wbot.id!, unreadMessages, companyId, groupContact);

    await provider(ticket, msg, companyId, contact, wbot as WASocket);

    // voltar para o menu inicial

    if (bodyMessage == "#") {
      await ticket.update({
        queueOptionId: null,
        chatbot: false,
        queueId: null,
      });
      await verifyQueue(wbot, msg, ticket, ticket.contact);
      return;
    }


    const ticketTraking = await FindOrCreateATicketTrakingService({
      ticketId: ticket.id,
      companyId,
      whatsappId: whatsapp?.id
    });


    try {
      if (!msg.key.fromMe) {
        /**
         * Tratamento para avaliação do atendente
         */
        if (verifyRating(ticketTraking)) {
          handleRating(msg, ticket, ticketTraking);
          return;
        }
      }
    } catch (e) {
      Sentry.captureException(e);
      console.log(e);
    }


    if (hasMedia) {
      console.log('entrou aqui')
      await verifyMediaMessage(msg, ticket, contact, ticket.companyId);
    } else {
      await verifyMessage(msg, ticket, contact, ticket.companyId);
    }

    const currentSchedule = await VerifyCurrentSchedule(companyId);
    const scheduleType = await Setting.findOne({
      where: {
        companyId,
        key: "scheduleType"
      }
    });


    try {
      if (!msg.key.fromMe && scheduleType) {
        /**
         * Tratamento para envio de mensagem quando a empresa está fora do expediente
         */
        if (
          scheduleType.value === "company" &&
          !isNil(currentSchedule) &&
          (!currentSchedule || currentSchedule.inActivity === false)
        ) {
          const body = `${whatsapp.outOfHoursMessage}`;

          const debouncedSentMessage = debounce(
            async () => {
              await wbot.sendMessage(
                `${ticket.contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"
                }`,
                {
                  text: body
                }
              );
            },
            3000,
            ticket.id
          );
          debouncedSentMessage();
          return;
        }


        if (scheduleType.value === "queue" && ticket.queueId !== null) {

          /**
           * Tratamento para envio de mensagem quando a fila está fora do expediente
           */
          const queue = await Queue.findByPk(ticket.queueId);

          const { schedules }: any = queue;
          const now = moment();
          const weekday = now.format("dddd").toLowerCase();
          let schedule = null;

          if (Array.isArray(schedules) && schedules.length > 0) {
            schedule = schedules.find(
              s =>
                s.weekdayEn === weekday &&
                s.startTime !== "" &&
                s.startTime !== null &&
                s.endTime !== "" &&
                s.endTime !== null
            );
          }

          if (
            scheduleType.value === "queue" &&
            queue.outOfHoursMessage !== null &&
            queue.outOfHoursMessage !== "" &&
            !isNil(schedule)
          ) {
            const startTime = moment(schedule.startTime, "HH:mm");
            const endTime = moment(schedule.endTime, "HH:mm");

            if (now.isBefore(startTime) || now.isAfter(endTime)) {
              const body = `${queue.outOfHoursMessage}`;
              const debouncedSentMessage = debounce(
                async () => {
                  await wbot.sendMessage(
                    `${ticket.contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"
                    }`,
                    {
                      text: body
                    }
                  );
                },
                3000,
                ticket.id
              );
              debouncedSentMessage();
              return;
            }
          }
        }

      }
    } catch (e) {
      Sentry.captureException(e);
      console.log(e);
    }

    try {
      if (!msg.key.fromMe) {
        if (ticketTraking !== null && verifyRating(ticketTraking)) {
          handleRating(msg, ticket, ticketTraking);
          return;
        }
      }
    } catch (e) {
      Sentry.captureException(e);
      console.log(e);
    }

    if (
      !ticket.queue &&
      !isGroup &&
      !msg.key.fromMe &&
      !ticket.userId &&
      whatsapp.queues.length >= 1
    ) {
      await verifyQueue(wbot, msg, ticket, ticket.contact);

    }

    const dontReadTheFirstQuestion = ticket.queue === null;

    await ticket.reload();

    try {
      //Fluxo fora do expediente
      if (!msg.key.fromMe && scheduleType && ticket.queueId !== null) {
        /**
         * Tratamento para envio de mensagem quando a fila está fora do expediente
         */
        const queue = await Queue.findByPk(ticket.queueId);

        const { schedules }: any = queue;
        const now = moment();
        const weekday = now.format("dddd").toLowerCase();
        let schedule = null;

        if (Array.isArray(schedules) && schedules.length > 0) {
          schedule = schedules.find(
            s =>
              s.weekdayEn === weekday &&
              s.startTime !== "" &&
              s.startTime !== null &&
              s.endTime !== "" &&
              s.endTime !== null
          );
        }

        if (
          scheduleType.value === "queue" &&
          queue.outOfHoursMessage !== null &&
          queue.outOfHoursMessage !== "" &&
          !isNil(schedule)
        ) {
          const startTime = moment(schedule.startTime, "HH:mm");
          const endTime = moment(schedule.endTime, "HH:mm");

          if (now.isBefore(startTime) || now.isAfter(endTime)) {
            const body = queue.outOfHoursMessage;
            const debouncedSentMessage = debounce(
              async () => {
                await wbot.sendMessage(
                  `${ticket.contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"
                  }`,
                  {
                    text: body
                  }
                );
              },
              3000,
              ticket.id
            );
            debouncedSentMessage();
            return;
          }
        }
      }
    } catch (e) {
      Sentry.captureException(e);
      console.log(e);
    }


    if (whatsapp?.queues?.length === 0 && !ticket.userId && !isGroup && !msg.key.fromMe && !ticket.queue) {

      const lastMessage = await Message.findOne({
        where: {
          ticketId: ticket.id,
          fromMe: true
        },
        order: [["createdAt", "DESC"]]
      });

      if (lastMessage && lastMessage.body.includes(whatsapp.greetingMessage)) {
        return;
      }

      if (whatsapp.greetingMessage && !msg.key.fromMe && !ticket.userId) {

        const debouncedSentMessage = debounce(
          async () => {
            await wbot.sendMessage(
              `${ticket.contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"
              }`,
              {
                text: whatsapp.greetingMessage
              }
            );
          },
          1000,
          ticket.id
        );
        debouncedSentMessage();
        return;
      }

    }


    if (whatsapp.queues.length == 1 && ticket.queue) {
      if (ticket.chatbot && !msg.key.fromMe) {
        await handleChartbot(ticket, msg, wbot);
      }
    }
    if (whatsapp.queues.length > 1 && ticket.queue) {
      if (ticket.chatbot && !msg.key.fromMe) {
        await handleChartbot(ticket, msg, wbot, dontReadTheFirstQuestion);
      }
    }

  } catch (err) {
    console.log(err)
    Sentry.captureException(err);
    logger.error(`Error handling whatsapp message: Err: ${err}`);
  }
};

const handleMsgAck = async (
  msg: WAMessage,
  chat: number | null | undefined
) => {
  await new Promise((r) => setTimeout(r, 500));
  const io = getIO();

  try {
    const messageToUpdate = await Message.findOne({
      where: {
        wid: msg.key.id,
      },
      include: [
        "contact",
        {
          model: Message,
          as: "quotedMsg",
          include: ["contact"],
        },
      ],
    });

    if (!messageToUpdate) return;
    await messageToUpdate.update({ ack: chat });
    io.to(messageToUpdate.ticketId.toString()).emit(
      `company-${messageToUpdate.companyId}-appMessage`,
      {
        action: "update",
        message: messageToUpdate,
      }
    );
  } catch (err) {
    Sentry.captureException(err);
    logger.error(`Error handling message ack. Err: ${err}`);
  }
};

const verifyRecentCampaign = async (
  message: proto.IWebMessageInfo,
  companyId: number
) => {
  if (!message.key.fromMe) {
    const number = message.key.remoteJid.replace(/\D/g, "");
    const campaigns = await Campaign.findAll({
      where: { companyId, status: "EM_ANDAMENTO", confirmation: true },
    });
    if (campaigns) {
      const ids = campaigns.map((c) => c.id);
      const campaignShipping = await CampaignShipping.findOne({
        where: { campaignId: { [Op.in]: ids }, number, confirmation: null },
      });

      if (campaignShipping) {
        await campaignShipping.update({
          confirmedAt: moment(),
          confirmation: true,
        });
        await campaignQueue.add(
          "DispatchCampaign",
          {
            campaignShippingId: campaignShipping.id,
            campaignId: campaignShipping.campaignId,
          },
          {
            delay: parseToMilliseconds(randomValue(0, 10)),
          }
        );
      }
    }
  }
};

const verifyCampaignMessageAndCloseTicket = async (
  message: proto.IWebMessageInfo,
  companyId: number
) => {
  const io = getIO();
  const body = await getBodyMessage(message);
  const isCampaign = /\u200c/.test(body);
  if (message.key.fromMe && isCampaign) {
    const messageRecord = await Message.findOne({
      where: { wid: message.key.id!, companyId },
    });

    if (!messageRecord) return
    const ticket = await Ticket.findByPk(messageRecord.ticketId);
    await ticket.update({ status: "closed" });

    io.to("open").emit(`company-${ticket.companyId}-ticket`, {
      action: "delete",
      ticket,
      ticketId: ticket.id,
    });

    io.to(ticket.status)
      .to(ticket.id.toString())
      .emit(`company-${ticket.companyId}-ticket`, {
        action: "update",
        ticket,
        ticketId: ticket.id,
      });
  }
};

const filterMessages = (msg: WAMessage): boolean => {
  if (msg.message?.protocolMessage) return false;

  if (
    [
      WAMessageStubType.REVOKE,
      WAMessageStubType.E2E_DEVICE_CHANGED,
      WAMessageStubType.E2E_IDENTITY_CHANGED,
      WAMessageStubType.CIPHERTEXT
    ].includes(msg.messageStubType as WAMessageStubType)
  )
    return false;

  return true;
};

const wbotMessageListener = async (wbot: Session, companyId: number): Promise<void> => {
  try {
    wbot.ev.on("messages.upsert", async (messageUpsert: ImessageUpsert) => {
      const messages = messageUpsert.messages
        .filter(filterMessages)
        .map(msg => msg);

      if (!messages) return;

      messages.forEach(async (message: proto.IWebMessageInfo) => {

        // if (
        //   !message.key.fromMe &&
        //   messageUpsert.type === "notify"
        // ) {
        //   (wbot as WASocket)!.readMessages([message.key]);
        // }

        const messageExists = await Message.count({
          where: { wid: message.key.id!, companyId }
        });

        if (!messageExists) {

          const body = await getBodyMessage(message);
          const isCampaign = /\u200c/.test(body);

          if (!isCampaign) {
            await handleMessage(message, wbot, companyId);
          }

          await verifyCampaignMessageAndCloseTicket(message, companyId);
          await verifyRecentCampaign(message, companyId);
        }
      });
    });

    wbot.ev.on("messages.update", (messageUpdate: WAMessageUpdate[]) => {
      if (messageUpdate.length === 0) return;
      messageUpdate.forEach(async (message: WAMessageUpdate) => {

        let ack: any;
        if (message.update.status === 3 && message?.key?.fromMe) {
          ack = 2;
        } else {
          ack = message.update.status;
        }

        handleMsgAck(message, ack);
      });
    });


    wbot.ev.on('message-receipt.update', (events: any) => {
      events.forEach(async (msg: any) => {
        const ack = msg?.receipt?.receiptTimestamp ? 3 :
          msg?.receipt?.readTimestamp ? 4 : 0;
        if (!ack) return;
        await handleMsgAck(msg, ack);
      });
    })


  } catch (error) {
    Sentry.captureException(error);
    logger.error(`Error handling wbot message listener. Err: ${error}`);
  }
};

export { wbotMessageListener, handleMessage };
