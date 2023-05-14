import Ticket from "./models/Ticket"
import Whatsapp from "./models/Whatsapp"
import { getIO } from "./libs/socket"

export const ClosedAllOpenTickets = async (): Promise<void> => {

  // @ts-ignore: Unreachable code error
  const closeTicket = async (ticket: any, useNPS: any, currentStatus: any) => {
    if (currentStatus === 'nps') {

      await ticket.update({
        status: "closed",
        userId: ticket.userId || null,
        unreadMessages: 0
      });

    } else if (currentStatus === 'open') {

      await ticket.update({
        status: useNPS ? 'nps' : "closed",
        userId: ticket.userId || null,
        unreadMessages: 0
      });

    } else {

      await ticket.update({
        status: "closed",
        userId: ticket.userId || null,
        unreadMessages: 0
      });

    }
  }

  const io = getIO();
  try {

    const { rows: tickets } = await Ticket.findAndCountAll({
      where: { status: "open" },
      order: [["updatedAt", "DESC"]]
    });

    tickets.forEach(async ticket => {

      const whatsapp = await Whatsapp.findByPk(ticket?.whatsappId);

      let horasFecharAutomaticamente = whatsapp?.expiresTicket;
      let useNPS = whatsapp?.useNPS;
   
      // @ts-ignore: Unreachable code error
      if (horasFecharAutomaticamente && horasFecharAutomaticamente !== "" &&
        // @ts-ignore: Unreachable code error
        horasFecharAutomaticamente !== "0" && Number(horasFecharAutomaticamente) > 0) {

        let dataLimite = new Date()
        dataLimite.setHours(dataLimite.getHours() - Number(horasFecharAutomaticamente));

        if (ticket.status === "open") {

          let dataUltimaInteracaoChamado = new Date(ticket.updatedAt)

          if (dataUltimaInteracaoChamado < dataLimite) {
            closeTicket(ticket, useNPS, ticket.status);

            io.to("open").emit(`company-${ticket.companyId}-ticket`, {
              action: "delete",
              ticket,
              ticketId: ticket.id
            });

          }
        }
      }

    });

  } catch (e: any) {
    console.log('e', e)
  }

}
