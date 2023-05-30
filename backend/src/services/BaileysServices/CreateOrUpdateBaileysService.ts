import { Chat, Contact } from "@whiskeysockets/baileys";
import Baileys from "../../models/Baileys";

interface Request {
  whatsappId: number;
  contacts?: Contact[];
  chats?: Chat[];
}



const createOrUpdateBaileysService = async ({
  whatsappId,
  contacts,
  chats,
}: Request): Promise<Baileys> => {

  const baileysExists = await Baileys.findOne({
    where: { whatsappId }
  });

  if (baileysExists) {
    const getChats = baileysExists.chats
      ? JSON.parse(baileysExists.chats)
      : [];
    const getContacts = baileysExists.contacts
      ? JSON.parse(baileysExists.contacts)
      : [];

    if (chats) {
      getChats.push(...chats);
      getChats.sort();
      const newChats = getChats.filter((v: Chat, i: number, a: Chat[]) => a.findIndex(v2 => (v2.id === v.id)) === i)

      return await baileysExists.update({
        chats: JSON.stringify(newChats),
      });
    }

    if (contacts) {
      getContacts.push(...contacts);
      getContacts.sort();
      const newContacts = getContacts.filter((v: Contact, i: number, a: Contact[]) => a.findIndex(v2 => (v2.id === v.id)) === i)

      return await baileysExists.update({
        contacts: JSON.stringify(newContacts),
      });
    }

  }

  const baileys = await Baileys.create({
    whatsappId,
    contacts: JSON.stringify(contacts),
    chats: JSON.stringify(chats)
  });
  await new Promise(resolve => setTimeout(resolve, 1000));
  return baileys;
};

export default createOrUpdateBaileysService;